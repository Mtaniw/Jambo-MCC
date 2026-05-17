import { useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';

export default function BrandingManager() {
  const { settings } = useSettings();

  useEffect(() => {
    // Update Favicon
    if (settings.favicon) {
      let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = settings.favicon;
    }

    // Update App Name in Title if needed 
    if (settings.systemName) {
       document.title = settings.systemName;
    }
  }, [settings]);

  return null;
}
