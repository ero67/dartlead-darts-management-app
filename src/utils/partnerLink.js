// Shop link for the active partner, tagged so the shop sees the visits from DartLead in its analytics.
const UTM = { utm_source: 'dartlead', utm_medium: 'app', utm_campaign: 'partner' };

export function partnerLink(url) {
  let link;
  try {
    link = new URL(url);
  } catch {
    return null;
  }
  for (const [key, value] of Object.entries(UTM)) link.searchParams.set(key, value);
  return link.toString();
}
