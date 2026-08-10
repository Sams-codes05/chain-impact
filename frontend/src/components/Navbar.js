import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  IconButton,
  useMediaQuery,
  useTheme,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism';
import ShieldIcon from '@mui/icons-material/Shield';

const Navbar = () => {
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const navItems = [
    { label: 'Home', path: '/' },
    { label: 'Donate', path: '/donate' },
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Verify', path: '/verify' },
  ];

  const toggleDrawer = (open) => (event) => {
    if (event.type === 'keydown' && (event.key === 'Tab' || event.key === 'Shift')) {
      return;
    }
    setDrawerOpen(open);
  };

  const drawer = (
    <Box
      sx={{ width: 280, height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#020617', color: 'white' }}
      role="presentation"
      onClick={toggleDrawer(false)}
      onKeyDown={toggleDrawer(false)}
    >
      <Box sx={{ px: 3, py: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 0 20px rgba(14, 165, 233, 0.4)',
          }}
        >
          <VolunteerActivismIcon fontSize="small" />
        </Box>
        <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: -0.5 }}>
          ChainImpact
        </Typography>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
      <List sx={{ flex: 1, px: 2, py: 3 }}>
        {navItems.map((item) => (
          <ListItem
            button
            key={item.path}
            component={Link}
            to={item.path}
            selected={location.pathname === item.path}
            sx={{
              borderRadius: '12px',
              mb: 1,
              py: 1.5,
              '&.Mui-selected': {
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                color: '#38bdf8',
                '&:hover': { backgroundColor: 'rgba(14, 165, 233, 0.15)' },
              },
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.03)',
              },
            }}
          >
            <ListItemText primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem' }} primary={item.label} />
          </ListItem>
        ))}
      </List>
      <Box sx={{ p: 3 }}>
        <Button
          component={Link}
          to="/donate"
          variant="contained"
          fullWidth
          sx={{
            borderRadius: '12px',
            py: 1.5,
            fontWeight: 700,
            backgroundColor: '#0ea5e9',
            textTransform: 'none',
            '&:hover': { backgroundColor: '#0284c7' },
          }}
        >
          Get Started
        </Button>
      </Box>
    </Box>
  );

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: 'rgba(2, 6, 23, 0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      }}
    >
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ minHeight: { xs: 70, md: 84 } }}>
          <Box
            component={Link}
            to="/"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: '0 0 20px rgba(14, 165, 233, 0.3)',
              }}
            >
              <VolunteerActivismIcon />
            </Box>
            <Typography
              variant="h5"
              fontWeight={800}
              sx={{
                display: { xs: 'none', sm: 'block' },
                letterSpacing: -1,
                background: 'linear-gradient(to right, #fff, #94a3b8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              ChainImpact
            </Typography>
          </Box>

          <Box sx={{ flexGrow: 1 }} />

          {isMobile ? (
            <IconButton size="large" color="inherit" onClick={toggleDrawer(true)}>
              <MenuIcon />
            </IconButton>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    component={Link}
                    to={item.path}
                    sx={{
                      px: 3,
                      py: 1,
                      borderRadius: '10px',
                      textTransform: 'none',
                      fontSize: '0.95rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#38bdf8' : 'rgba(255,255,255,0.6)',
                      transition: 'all 0.2s',
                      '&:hover': {
                        color: '#fff',
                        backgroundColor: 'rgba(255,255,255,0.05)',
                      },
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
              
              <Box sx={{ width: 20 }} />
              
              <Button
                component={Link}
                to="/admin"
                startIcon={<ShieldIcon fontSize="small" />}
                sx={{
                  px: 2.5,
                  py: 1,
                  borderRadius: '10px',
                  textTransform: 'none',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '0.9rem',
                  '&:hover': { color: '#fff' },
                }}
              >
                Admin
              </Button>

              <Button
                component={Link}
                to="/donate"
                variant="contained"
                sx={{
                  ml: 2,
                  px: 4,
                  py: 1.2,
                  borderRadius: '12px',
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  backgroundColor: '#0ea5e9',
                  boxShadow: '0 4px 14px 0 rgba(14, 165, 233, 0.39)',
                  '&:hover': {
                    backgroundColor: '#0284c7',
                    boxShadow: '0 6px 20px rgba(14, 165, 233, 0.23)',
                  },
                }}
              >
                Donate Now
              </Button>
            </Box>
          )}
        </Toolbar>
      </Container>
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={toggleDrawer(false)}
        PaperProps={{
          sx: { backgroundColor: 'transparent', boxShadow: 'none' }
        }}
      >
        {drawer}
      </Drawer>
    </AppBar>
  );
};

export default Navbar;