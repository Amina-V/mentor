// popup.tsx
import React, { useEffect, useState } from 'react';
import { render } from 'react-dom';
import { STYLES } from '../shared/constants';
import './popup.css';
// components
import AuthenticatedMenu from './components/authenticated-menu';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import { LogoLink } from '../shared/components';
import UnauthenticatedMenu from './components/unauthenticated-menu';

const Popup: React.FC = () => {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    // opens port to enable listening for when Popup is closed (see background.js script)
    chrome.runtime.connect({ name: 'popup' });
    chrome.storage.sync.get(['apiKey'], ({ apiKey }) => {
      setAuthenticated(!!apiKey);
    });

    // Request microphone access
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        console.log("Microphone access granted!");
        // You can handle the audio stream here if needed
      })
      .catch((error) => {
        console.error("Error accessing microphone:", error);
      });
  }, []);

  return (
    <Card sx={STYLES.cardStyles}>
      <CardContent sx={STYLES.cardContentStyles}>
        <LogoLink />
        <Divider sx={{ marginTop: '12px' }} />
        {!authenticated ? <UnauthenticatedMenu /> : <AuthenticatedMenu />}
      </CardContent>
    </Card>
  );
};

const root = document.createElement('div');
root.setAttribute('class', 'popup-container');
document.body.appendChild(root);
render(<Popup />, root);