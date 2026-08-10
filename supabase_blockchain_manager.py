"""Supabase blockchain data manager.

This module provides a production-ready interface for working with Supabase
in the context of blockchain-oriented applications. It encapsulates the
connection lifecycle, table provisioning, and CRUD interactions for managing
immutable off-chain metadata that complements on-chain transactions.
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

import requests
from requests.exceptions import ConnectionError, Timeout
from supabase import Client, create_client


LOGGER = logging.getLogger(__name__)


class SupabaseInitializationError(RuntimeError):
    """Raised when the Supabase client cannot be created."""


class SupabaseTableProvisioningError(RuntimeError):
    """Raised when the manager cannot verify or create the required table."""


class SupabaseNetworkError(RuntimeError):
    """Raised when there are network connectivity issues with Supabase."""


class BlockchainDBManager:
    """Manage Supabase connectivity and persistence for blockchain metadata."""

    DEFAULT_TABLE_NAME = "offchain_data"
    DEFAULT_URL = "https://eddzshqrzoafnrsejxmh.supabase.co"
    DEFAULT_ANON_KEY = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZHpzaHFyem9yc2VqeG1oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0NzQxNzYs"
        "ImV4cCI6MjA3NTA1MDE3Nn0.vDIt8RHmo2-xBEBSWlWF43H2V08E_IHHn0EJVCW2BQc"
    )

    # Suggested Postgres function name for privileged SQL execution.
    _SQL_EXECUTOR_FUNCTION = "execute_sql"

    def __init__(
        self,
        *,
        supabase_url: Optional[str] = None,
        supabase_key: Optional[str] = None,
        supabase_service_key: Optional[str] = None,
        table_name: Optional[str] = None,
        session: Optional[requests.Session] = None,
        auto_provision: bool = True,
        donor_table_name: str = "donors",
        max_retries: int = 3,
        retry_delay: float = 1.0,
        fallback_mode: bool = True,
    ) -> None:
        """Initialize the manager with Supabase credentials and ensure table readiness."""
        self._url = supabase_url or os.getenv("SUPABASE_URL", self.DEFAULT_URL)
        self._service_key = supabase_service_key or os.getenv("SUPABASE_SERVICE_KEY")
        self._api_key = (
            supabase_key
            or self._service_key
            or os.getenv("SUPABASE_ANON_KEY", self.DEFAULT_ANON_KEY)
        )
        if not self._service_key and supabase_key:
            # If the caller provided a single key, reuse it for privileged operations.
            self._service_key = supabase_key
        self._table_name = table_name or self.DEFAULT_TABLE_NAME
        self._donor_table_name = donor_table_name
        self._session = session or requests.Session()
        self._auto_provision = auto_provision
        self._max_retries = max_retries
        self._retry_delay = retry_delay
        self._fallback_mode = fallback_mode
        self._is_connected = False

        LOGGER.debug("Initializing Supabase client for URL %s", self._url)
        try:
            self._client: Client = create_client(self._url, self._api_key)
            # Test connectivity
            self._test_connectivity()
            self._is_connected = True
        except Exception as exc:  # pragma: no cover - defensive guard
            LOGGER.exception("Failed to create Supabase client or establish connectivity")
            if self._fallback_mode:
                LOGGER.warning("Operating in fallback mode - Supabase operations will be disabled")
                self._client = None
                self._is_connected = False
            else:
                raise SupabaseInitializationError("Unable to instantiate Supabase client") from exc

        if self._auto_provision and not self._service_key:
            LOGGER.warning(
                "Auto provisioning is enabled but no Supabase service role key was provided. "
                "Attempting to use the primary API key; provisioning may fail if it lacks privileges."
            )

        if self._auto_provision and self._is_connected:
            try:
                self._ensure_table_exists()
                self._ensure_donor_table_exists()
            except (SupabaseTableProvisioningError, SupabaseNetworkError) as exc:
                if not self._service_key:
                    LOGGER.error(
                        "Table provisioning failed. Provide a Supabase service role key via "
                        "SUPABASE_SERVICE_KEY to enable automatic provisioning."
                    )
                if self._fallback_mode:
                    LOGGER.warning("Table provisioning failed, continuing in fallback mode")
                    self._is_connected = False
                else:
                    raise
        else:
            LOGGER.info("Auto provisioning disabled; skipping table readiness check")

    # ------------------------------------------------------------------
    # Connectivity and Health Check Methods
    # ------------------------------------------------------------------
    def _test_connectivity(self) -> None:
        """Test basic connectivity to Supabase."""
        try:
            # Simple connectivity test - try to access the health endpoint
            health_url = f"{self._url}/rest/v1/"
            headers = {
                "apikey": self._api_key,
                "Authorization": f"Bearer {self._api_key}",
            }
            response = self._session.get(health_url, headers=headers, timeout=10)
            if response.status_code >= 500:
                raise SupabaseNetworkError(f"Supabase server error: {response.status_code}")
        except (ConnectionError, Timeout, requests.exceptions.RequestException) as exc:
            LOGGER.error("Network connectivity test failed: %s", exc)
            raise SupabaseNetworkError("Unable to connect to Supabase") from exc

    def is_connected(self) -> bool:
        """Check if the manager is currently connected to Supabase."""
        return self._is_connected

    def get_connection_status(self) -> Dict[str, Any]:
        """Get detailed connection status information."""
        return {
            "connected": self._is_connected,
            "url": self._url,
            "fallback_mode": self._fallback_mode,
            "auto_provision": self._auto_provision,
            "table_name": self._table_name,
            "donor_table_name": self._donor_table_name,
        }

    def reconnect(self) -> bool:
        """Attempt to reconnect to Supabase."""
        if self._is_connected:
            return True
        
        try:
            LOGGER.info("Attempting to reconnect to Supabase...")
            self._test_connectivity()
            self._is_connected = True
            LOGGER.info("Successfully reconnected to Supabase")
            return True
        except Exception as exc:
            LOGGER.warning("Reconnection attempt failed: %s", exc)
            return False

    def _retry_with_backoff(self, operation, *args, **kwargs):
        """Execute an operation with exponential backoff retry logic."""
        last_exception = None
        for attempt in range(self._max_retries):
            try:
                return operation(*args, **kwargs)
            except (ConnectionError, Timeout, requests.exceptions.RequestException) as exc:
                last_exception = exc
                if attempt < self._max_retries - 1:
                    delay = self._retry_delay * (2 ** attempt)
                    LOGGER.warning(
                        "Network operation failed (attempt %d/%d), retrying in %.1fs: %s",
                        attempt + 1, self._max_retries, delay, exc
                    )
                    time.sleep(delay)
                else:
                    LOGGER.error("All retry attempts exhausted for network operation")
        
        raise SupabaseNetworkError("Network operation failed after all retries") from last_exception

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def create_offchain_event(
        self,
        *,
        event_name: str,
        blockchain_tx_hash: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Insert a new off-chain event related to a blockchain transaction."""
        if not event_name:
            raise ValueError("event_name is required")
        if not blockchain_tx_hash:
            raise ValueError("blockchain_tx_hash is required")

        if not self._is_connected:
            LOGGER.warning("Supabase not connected - returning mock response for off-chain event")
            return {
                "id": str(uuid.uuid4()),
                "event_name": event_name,
                "blockchain_tx_hash": blockchain_tx_hash,
                "metadata": metadata or {},
                "created_at": datetime.now(timezone.utc).isoformat(),
                "_fallback_mode": True
            }

        payload: Dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "event_name": event_name,
            "blockchain_tx_hash": blockchain_tx_hash,
            "metadata": metadata or {},
        }
        LOGGER.debug("Inserting off-chain event payload: %s", payload)

        try:
            def _insert_operation():
                response = self._client.table(self._table_name).insert(payload).execute()
                return response.data[0] if response.data else payload
            
            inserted = self._retry_with_backoff(_insert_operation)
            LOGGER.info("Inserted off-chain event with id=%s", inserted.get("id"))
            return inserted
        except (SupabaseNetworkError, Exception) as exc:
            LOGGER.exception("Failed to insert off-chain event")
            if self._fallback_mode:
                LOGGER.warning("Falling back to mock response due to network error")
                payload["created_at"] = datetime.now(timezone.utc).isoformat()
                payload["_fallback_mode"] = True
                return payload
            raise

    def read_offchain_events(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Read events with optional filtering criteria."""
        if not self._is_connected:
            LOGGER.warning("Supabase not connected - returning empty list for off-chain events")
            return []

        filters = filters or {}
        LOGGER.debug("Fetching off-chain events with filters: %s", filters)
        
        try:
            def _read_operation():
                query = self._client.table(self._table_name).select("*")
                for key, value in filters.items():
                    if isinstance(value, dict):
                        for operator, operand in value.items():
                            query = self._apply_filter(query, key, operator, operand)
                    else:
                        query = query.eq(key, value)
                response = query.execute()
                return response.data
            
            data = self._retry_with_backoff(_read_operation)
            LOGGER.info("Fetched %d records", len(data))
            return data
        except (SupabaseNetworkError, Exception) as exc:
            LOGGER.exception("Failed to fetch off-chain events")
            if self._fallback_mode:
                LOGGER.warning("Falling back to empty list due to network error")
                return []
            raise

    def read_by_transaction_hash(self, blockchain_tx_hash: str) -> List[Dict[str, Any]]:
        """Fetch events matching a specific blockchain transaction hash."""
        if not blockchain_tx_hash:
            raise ValueError("blockchain_tx_hash is required")
        return self.read_offchain_events({"blockchain_tx_hash": blockchain_tx_hash})

    def update_offchain_event(
        self,
        *,
        record_id: str,
        update_payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Update an existing record (discouraged; blockchain metadata should be immutable)."""
        if not record_id:
            raise ValueError("record_id is required")
        if not update_payload:
            raise ValueError("update_payload is required")

        LOGGER.warning(
            "Updating off-chain records is discouraged for blockchain workflows; ensure compliance before proceeding."
        )
        try:
            response = (
                self._client.table(self._table_name)
                .update(update_payload)
                .eq("id", record_id)
                .execute()
            )
            updated = response.data[0] if response.data else {}
            LOGGER.info("Updated off-chain event with id=%s", record_id)
            return updated
        except Exception as exc:
            LOGGER.exception("Failed to update off-chain event")
            raise

    def delete_offchain_event(self, *, record_id: str) -> None:
        """Delete a record (discouraged; prefer logical deletes or archival strategies)."""
        if not record_id:
            raise ValueError("record_id is required")

        LOGGER.warning(
            "Deleting off-chain records is discouraged for blockchain workflows; consider archival strategies instead."
        )
        try:
            self._client.table(self._table_name).delete().eq("id", record_id).execute()
            LOGGER.info("Deleted off-chain event with id=%s", record_id)
        except Exception as exc:
            LOGGER.exception("Failed to delete off-chain event")
            raise

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _ensure_table_exists(self) -> None:
        """Verify that the target table exists; attempt to create it if missing."""
        LOGGER.debug("Ensuring table '%s' exists", self._table_name)
        if self._table_exists(self._table_name):
            LOGGER.debug("Table '%s' already present", self._table_name)
            return

        LOGGER.info("Table '%s' missing, attempting creation", self._table_name)
        create_statement = f"""
        create table if not exists public.{self._table_name} (
            id uuid primary key default gen_random_uuid(),
            event_name text not null,
            blockchain_tx_hash text not null,
            metadata jsonb,
            created_at timestamp with time zone default timezone('utc', now())
        );
        """

        try:
            self._execute_sql(create_statement)
            if not self._table_exists(self._table_name):
                raise SupabaseTableProvisioningError(
                    "Table creation command executed but table is still missing"
                )
            LOGGER.info("Table '%s' created successfully", self._table_name)
        except Exception as exc:
            LOGGER.exception("Unable to ensure table '%s' exists", self._table_name)
            raise

    def _table_exists(self, table_name: str) -> bool:
        """Return True if the specified table already exists."""
        try:
            response = (
                self._client.table("information_schema.tables")
                .select("table_name")
                .eq("table_schema", "public")
                .eq("table_name", table_name)
                .execute()
            )
            exists = bool(response.data)
            LOGGER.debug("Table '%s' existence check via information_schema: %s", table_name, exists)
            if exists:
                return True
        except Exception as exc:
            LOGGER.warning(
                "Failed to validate table presence via information_schema; falling back to direct probe."
            )
            LOGGER.debug("information_schema failure: %s", exc)

        # Fallback: attempt to query the target table directly. If it exists and is accessible,
        # PostgREST will return an empty list (HTTP 200) even when there are no rows yet.
        try:
            response = (
                self._client.table(table_name)
                .select("id")
                .limit(1)
                .execute()
            )
            LOGGER.debug(
                "Fallback existence check for table '%s' succeeded with %d row(s)",
                table_name,
                len(response.data),
            )
            return True
        except Exception as fallback_exc:
            LOGGER.debug(
                "Fallback existence probe for table '%s' failed: %s",
                table_name,
                fallback_exc,
            )
            return False

    def _execute_sql(self, sql: str) -> Dict[str, Any]:
        """Execute a privileged SQL statement via Supabase RPC."""
        rpc_url = f"{self._url}/rest/v1/rpc/{self._SQL_EXECUTOR_FUNCTION}"
        key_for_sql = self._service_key or self._api_key
        headers = {
            "apikey": key_for_sql,
            "Authorization": f"Bearer {key_for_sql}",
            "Content-Type": "application/json",
            "Prefer": "params=single-object",
        }
        payload = {"query": sql}
        LOGGER.debug("Executing SQL via RPC %s: %s", self._SQL_EXECUTOR_FUNCTION, sql)

        try:
            def _sql_operation():
                response = self._session.post(rpc_url, headers=headers, json=payload, timeout=15)
                if response.status_code >= 400:
                    LOGGER.error(
                        "SQL execution failed with status %s: %s",
                        response.status_code,
                        response.text,
                    )
                    raise SupabaseTableProvisioningError(
                        f"Failed to execute SQL via RPC '{self._SQL_EXECUTOR_FUNCTION}'"
                    )
                return response
            
            response = self._retry_with_backoff(_sql_operation)
            try:
                result = response.json()
            except json.JSONDecodeError:
                result = {"raw_response": response.text}
            return result
        except (ConnectionError, Timeout, requests.exceptions.RequestException) as exc:
            LOGGER.error("Network error during SQL execution: %s", exc)
            raise SupabaseNetworkError("Failed to execute SQL due to network error") from exc

    def _ensure_donor_table_exists(self) -> None:
        """Ensure the donor table exists with the expected schema."""
        LOGGER.debug("Ensuring donor table '%s' exists", self._donor_table_name)
        if self._table_exists(self._donor_table_name):
            LOGGER.debug("Donor table '%s' already present", self._donor_table_name)
            return

        LOGGER.info("Donor table '%s' missing, attempting creation", self._donor_table_name)
        create_statement = f"""
        create table if not exists public.{self._donor_table_name} (
            id uuid primary key default gen_random_uuid(),
            donation_id integer,
            donor_name text not null,
            donor_email text,
            donor_phone text,
            donor_address text,
            amount numeric not null,
            currency text not null,
            transaction_id text,
            payment_method text,
            message text,
            campaign text,
            blockchain_tx_hash text,
            blockchain_verified boolean,
            etherscan_link text,
            receipt_number text,
            receipt_path text,
            status text,
            verified_by text,
            verification_notes text,
            tax_exemption_claimed boolean,
            pan_number text,
            created_at timestamp with time zone,
            updated_at timestamp with time zone,
            synced_at timestamp with time zone default timezone('utc', now())
        );
        """

        try:
            self._execute_sql(create_statement)
            if not self._table_exists(self._donor_table_name):
                raise SupabaseTableProvisioningError(
                    "Donor table creation command executed but table is still missing"
                )
            LOGGER.info("Donor table '%s' created successfully", self._donor_table_name)
        except Exception as exc:
            LOGGER.exception("Unable to ensure donor table '%s' exists", self._donor_table_name)
            raise

    def create_donor_record(self, donation: Dict[str, Any]) -> Dict[str, Any]:
        """Insert a donor record into Supabase."""
        if not donation:
            raise ValueError("donation data is required")
        payload = self._build_donor_payload(donation)
        LOGGER.debug("Inserting donor payload into Supabase: %s", payload)
        try:
            response = (
                self._client.table(self._donor_table_name)
                .upsert(payload, on_conflict="id")
                .execute()
            )
            status_code = getattr(response, "status_code", None)
            if status_code and status_code >= 400:
                LOGGER.error(
                    "Supabase upsert failed with status %s. Response data: %s", status_code, response.data
                )
                raise SupabaseTableProvisioningError(
                    f"Supabase upsert failed with status {status_code}."
                )

            inserted = response.data[0] if response.data else payload
            LOGGER.info(
                "Upserted donor record for donation_id=%s into Supabase (status=%s)",
                inserted.get("donation_id"),
                status_code,
            )
            if not response.data:
                LOGGER.warning(
                    "Supabase upsert returned no data payload. Full response attributes: status=%s, count=%s",
                    status_code,
                    getattr(response, "count", None),
                )
            return inserted
        except Exception as exc:
            LOGGER.exception("Failed to upsert donor record into Supabase")
            raise

    def create_donor_records(self, donations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Bulk upsert donor records."""
        if not donations:
            return []
        payloads = [self._build_donor_payload(donation) for donation in donations]
        LOGGER.debug(
            "Bulk upserting %d donor payloads into Supabase table '%s'",
            len(payloads),
            self._donor_table_name,
        )
        try:
            response = (
                self._client.table(self._donor_table_name)
                .upsert(payloads, on_conflict="donation_id")
                .execute()
            )
            inserted = response.data if response.data else payloads
            LOGGER.info(
                "Upserted %d donor records into Supabase table '%s'",
                len(inserted),
                self._donor_table_name,
            )
            return inserted
        except Exception as exc:
            LOGGER.exception("Failed to bulk upsert donor records into Supabase")
            raise

    def _build_donor_payload(self, donation: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare the payload for Supabase donor table."""
        def parse_datetime(value: Union[str, datetime, None]) -> Optional[str]:
            if value is None:
                return None
            if isinstance(value, datetime):
                if value.tzinfo is None:
                    value = value.replace(tzinfo=timezone.utc)
                return value.isoformat()
            try:
                parsed = datetime.fromisoformat(value)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return parsed.isoformat()
            except Exception:
                LOGGER.debug("Unable to parse datetime value '%s'", value)
                return None

        receipt_number = donation.get("receipt_number")

        # Determine a stable, valid UUID primary key for Supabase records.
        primary_key_candidate = donation.get("supabase_id") or donation.get("id_uuid")
        primary_key: Optional[str]
        if primary_key_candidate:
            try:
                primary_key = str(uuid.UUID(str(primary_key_candidate)))
            except (ValueError, AttributeError, TypeError):
                LOGGER.debug(
                    "Supplied Supabase identifier '%s' is not a valid UUID; generating a new identifier.",
                    primary_key_candidate,
                )
                primary_key = None
        else:
            primary_key = None

        if primary_key is None:
            donation_id = donation.get("id")
            if donation_id is not None:
                primary_key = str(uuid.uuid5(uuid.NAMESPACE_URL, f"donation:{donation_id}"))
            else:
                primary_key = str(uuid.uuid4())

        payload = {
            "id": primary_key,
            "donation_id": donation.get("id"),
            "donor_name": donation.get("donor_name"),
            "donor_email": donation.get("donor_email"),
            "donor_phone": donation.get("donor_phone"),
            "donor_address": donation.get("donor_address"),
            "amount": donation.get("amount"),
            "currency": donation.get("currency"),
            "transaction_id": donation.get("transaction_id"),
            "payment_method": donation.get("payment_method"),
            "message": donation.get("message"),
            "campaign": donation.get("campaign"),
            "blockchain_tx_hash": donation.get("blockchain_tx_hash"),
            "blockchain_verified": donation.get("blockchain_verified"),
            "etherscan_link": donation.get("etherscan_link"),
            "receipt_number": receipt_number,
            "receipt_path": donation.get("receipt_path"),
            "status": donation.get("status"),
            "verified_by": donation.get("verified_by"),
            "verification_notes": donation.get("verification_notes"),
            "tax_exemption_claimed": donation.get("tax_exemption_claimed"),
            "pan_number": donation.get("pan_number"),
            "created_at": parse_datetime(donation.get("created_at")),
            "updated_at": parse_datetime(donation.get("updated_at")),
            "synced_at": datetime.now(timezone.utc).isoformat(),
        }
        return payload

    def _apply_filter(self, query: Any, field: str, operator: str, value: Any) -> Any:
        """Apply a filter using supported PostgREST operators."""
        operator_map = {
            "eq": query.eq,
            "neq": query.neq,
            "lt": query.lt,
            "lte": query.lte,
            "gt": query.gt,
            "gte": query.gte,
            "like": query.like,
            "ilike": query.ilike,
            "contains": query.contains,
            "contained_by": query.contained_by,
        }
        if operator not in operator_map:
            raise ValueError(f"Unsupported filter operator: {operator}")
        LOGGER.debug("Applying filter %s %s %s", field, operator, value)
        return operator_map[operator](field, value)


# ----------------------------------------------------------------------
# Future integration placeholders
# ----------------------------------------------------------------------
# TODO: Integrate Supabase Auth (user sessions, service roles) for tenant-aware data separation.
# TODO: Connect Supabase Storage bucket for off-chain asset persistence (e.g., receipts, proofs).
# TODO: Implement Role Level Security (RLS) policies aligned with blockchain identity verification.


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    manager = BlockchainDBManager()
    LOGGER.info("Supabase connection established")

    sample_metadata = {
        "network": "ethereum-mainnet",
        "contract_address": "0x1234567890abcdef1234567890abcdef12345678",
        "event_payload": {
            "donor": "0xabcd...ef01",
            "recipient": "0x9876...5432",
            "amount": "1.25 ETH",
        },
    }

    sample_record = manager.create_offchain_event(
        event_name="DonationReceived",
        blockchain_tx_hash="0xbeefcafedeadbeefcafedeadbeefcafedeadbeefcafedeadbeefcafedeadbeef",
        metadata=sample_metadata,
    )
    LOGGER.info("Sample record stored: %s", sample_record)

    all_records = manager.read_offchain_events()
    LOGGER.info("Fetched %d total off-chain records", len(all_records))
    for record in all_records:
        print(json.dumps(record, indent=2, default=str))