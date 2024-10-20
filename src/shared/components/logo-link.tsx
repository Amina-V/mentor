import React from 'react';
import './logo-link.css';
// components
import Link from '@mui/material/Link';

const LogoLink: React.FC<{}> = () => {
  return (
      <img className='logo' src='senpai-logo.png' alt='Logo' />
  );
};

export default LogoLink;
