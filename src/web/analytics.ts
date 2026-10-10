import { inject } from '@vercel/analytics';

// Included only by the Vercel build; offline/local sessions do not send analytics.
inject({
  mode: 'production',
  beforeSend: event => {
    const url = new URL(event.url);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.toString() };
  },
});
