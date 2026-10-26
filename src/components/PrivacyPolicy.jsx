import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { getSupportEmail } from '../utils/publicUrl';

// The policy is a legal document with links inside sentences, so each language
// is written out here instead of split into dozens of translation keys.

const linkClass = 'font-medium text-primary underline underline-offset-4';

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

const P = ({ children }) => <p className="text-muted-foreground leading-7">{children}</p>;
const List = ({ children }) => <ul className="list-disc pl-6 text-muted-foreground leading-7 [&>li]:mt-1">{children}</ul>;
const Item = ({ label, children }) => (
  <li>{label && <strong className="font-medium text-foreground">{label}: </strong>}{children}</li>
);
const DeleteLink = ({ children }) => <Link to="/delete-account" className={linkClass}>{children}</Link>;
const Mail = ({ email }) => <a href={`mailto:${email}`} className={linkClass}>{email}</a>;

function PolicyEn({ supportEmail }) {
  return (
    <>
      <Section title="1. Who we are">
        <P>DartLead is a darts tournament and league management app. This privacy policy explains what data we collect, why we collect it, and how we protect it.</P>
      </Section>
      <Section title="2. What we collect">
        <List>
          <Item label="Account data">email address and display name. If you sign in with Google, we receive your Google account email and name; we never see your Google password.</Item>
          <Item label="Player data">the player name shown in tournaments, and the link between that player and your account.</Item>
          <Item label="Tournament data">tournaments, groups, players, matches, scores, and statistics you create or manage.</Item>
          <Item label="Device data">a random device identifier and the optional device name / board number you enter, used to show which board a match is running on; IP address as processed by hosting and database providers. The Android app additionally stores your preferences (theme, language, vibration strength) on the device only.</Item>
          <Item label="Usage data">app interaction events, error logs, and performance metrics to keep the service reliable.</Item>
          <Item label="Cookies/local storage">used for authentication sessions, language/theme preferences, and in-progress match state.</Item>
        </List>
      </Section>
      <Section title="3. How we use the data">
        <List>
          <Item>To authenticate users and secure access to tournaments and matches.</Item>
          <Item>To store and display tournament schedules, results, and live scoring.</Item>
          <Item>To sync live matches across devices and prevent conflicts.</Item>
          <Item>To improve reliability, debug issues, and prevent abuse.</Item>
          <Item>To comply with legal obligations and protect the service and its users.</Item>
        </List>
      </Section>
      <Section title="4. How we share data">
        <List>
          <Item label="Service providers">We use Supabase for authentication, database, and realtime updates; hosting/CDN providers may process IP addresses and basic request data.</Item>
          <Item label="Tournament visibility">Tournament results, standings, match statistics and player profiles (the player name you use) are public: anyone with the link can see them, without signing in. League pages, leaderboards and member lists are visible to signed-in users. Registration requests are visible only to you and the organisers.</Item>
          <Item label="Legal">We may disclose information if required by law or to protect the safety, rights, or property of users or the service.</Item>
          <Item>We do not sell personal data.</Item>
        </List>
      </Section>
      <Section title="5. Data retention">
        <P>We retain account and tournament data while your account remains active or as needed to operate the service. Live match state cached on devices is cleared automatically or can be removed by clearing browser storage. We may keep minimal logs for security and compliance purposes.</P>
      </Section>
      <Section title="6. Your choices">
        <List>
          <Item>You can delete your account yourself at any time: sign in, open <em>My profile</em> and use <em>Account → Delete my account</em>. See <DeleteLink>how account deletion works</DeleteLink> for what is removed and what is kept.</Item>
          <Item>You can change the name shown in tournaments from your profile.</Item>
          <Item>You can clear browser storage (localStorage/cookies) to remove locally cached state.</Item>
          <Item>You can ask an organiser to enter you under a nickname instead of your full name.</Item>
        </List>
      </Section>
      <Section title="7. Security">
        <P>We use HTTPS, authenticated access, and role-based controls. Supabase secures authentication and database storage. No system is 100% secure; please use a strong, unique password and protect your device.</P>
      </Section>
      <Section title="8. Children's data">
        <P>The service is not directed to children under 16. Do not create accounts for minors without appropriate consent where required.</P>
      </Section>
      <Section title="9. International transfers">
        <P>Data is stored by Supabase in the European Union (Stockholm region) and served through Vercel. Where a provider processes data outside the EU we rely on their safeguards (such as standard contractual clauses).</P>
      </Section>
      <Section title="10. Account deletion">
        <P>Deleting your account removes your login (email, password, Google identity), display name, tournament and league registrations, scorer permissions and subscription records. Tournaments, leagues and match results you took part in or organised are kept, because they are the organiser&apos;s record of the event; your player name stays visible in those results but is no longer linked to any account. Deletion is immediate and cannot be undone. Step-by-step instructions: <DeleteLink>Delete account</DeleteLink>.</P>
      </Section>
      <Section title="11. Contact">
        <P>Questions about this policy or your data{supportEmail ? <>: <Mail email={supportEmail} /></> : ' can be sent to the operator of the service through the contact details published on dartlead.app'}.</P>
      </Section>
    </>
  );
}

function PolicySk({ supportEmail }) {
  return (
    <>
      <Section title="1. Kto sme">
        <P>DartLead je aplikácia na správu šípkarských turnajov a líg. Tieto zásady vysvetľujú, aké údaje zbierame, prečo ich zbierame a ako ich chránime.</P>
      </Section>
      <Section title="2. Aké údaje zbierame">
        <List>
          <Item label="Údaje o účte">e-mailová adresa a zobrazované meno. Ak sa prihlásite cez Google, dostaneme e-mail a meno vášho účtu Google; vaše heslo do Google nikdy nevidíme.</Item>
          <Item label="Údaje o hráčovi">meno hráča zobrazené v turnajoch a prepojenie tohto hráča s vaším účtom.</Item>
          <Item label="Údaje o turnajoch">turnaje, skupiny, hráči, zápasy, skóre a štatistiky, ktoré vytvoríte alebo spravujete.</Item>
          <Item label="Údaje o zariadení">náhodný identifikátor zariadenia a voliteľný názov zariadenia alebo číslo terča, ktoré zadáte, aby bolo vidieť, na ktorom terči zápas beží; IP adresa v rozsahu, v akom ju spracúvajú poskytovatelia hostingu a databázy. Aplikácia pre Android navyše ukladá vaše nastavenia (téma, jazyk, sila vibrácií) iba vo vašom zariadení.</Item>
          <Item label="Údaje o používaní">udalosti pri používaní aplikácie, záznamy o chybách a údaje o výkone, aby služba fungovala spoľahlivo.</Item>
          <Item label="Cookies a lokálne úložisko">slúžia na prihlásenie, nastavenie jazyka a témy a na uloženie rozohraného zápasu.</Item>
        </List>
      </Section>
      <Section title="3. Na čo údaje používame">
        <List>
          <Item>Na overenie používateľov a zabezpečenie prístupu k turnajom a zápasom.</Item>
          <Item>Na ukladanie a zobrazovanie rozpisov, výsledkov a živého skórovania.</Item>
          <Item>Na synchronizáciu živých zápasov medzi zariadeniami a predchádzanie konfliktom.</Item>
          <Item>Na zlepšovanie spoľahlivosti, hľadanie chýb a predchádzanie zneužitiu.</Item>
          <Item>Na plnenie zákonných povinností a ochranu služby a jej používateľov.</Item>
        </List>
      </Section>
      <Section title="4. Komu údaje poskytujeme">
        <List>
          <Item label="Poskytovatelia služieb">Na prihlásenie, databázu a aktualizácie v reálnom čase používame Supabase; poskytovatelia hostingu a CDN môžu spracúvať IP adresy a základné údaje o požiadavkách.</Item>
          <Item label="Viditeľnosť turnajov">Výsledky turnajov, tabuľky, štatistiky zápasov a profily hráčov (meno hráča, ktoré používate) sú verejné: vidí ich každý, kto má odkaz, aj bez prihlásenia. Stránky líg, rebríčky a zoznamy členov vidia prihlásení používatelia. Žiadosti o registráciu vidíte iba vy a organizátori.</Item>
          <Item label="Zákonné dôvody">Údaje môžeme poskytnúť, ak to vyžaduje zákon alebo ak je to potrebné na ochranu bezpečnosti, práv či majetku používateľov alebo služby.</Item>
          <Item>Osobné údaje nepredávame.</Item>
        </List>
      </Section>
      <Section title="5. Ako dlho údaje uchovávame">
        <P>Údaje o účte a turnajoch uchovávame, kým je váš účet aktívny, alebo kým sú potrebné na prevádzku služby. Stav rozohraného zápasu uložený v zariadení sa vymaže automaticky alebo ho môžete odstrániť vymazaním úložiska prehliadača. Na účely bezpečnosti a súladu s predpismi môžeme uchovávať minimálne záznamy.</P>
      </Section>
      <Section title="6. Vaše možnosti">
        <List>
          <Item>Svoj účet môžete kedykoľvek zmazať sami: prihláste sa, otvorte <em>Môj Profil</em> a použite <em>Účet → Zmazať môj účet</em>. Čo sa vymaže a čo zostane, nájdete v časti <DeleteLink>ako funguje zmazanie účtu</DeleteLink>.</Item>
          <Item>Meno zobrazené v turnajoch môžete zmeniť vo svojom profile.</Item>
          <Item>Vymazaním úložiska prehliadača (localStorage, cookies) odstránite lokálne uložené údaje.</Item>
          <Item>Môžete požiadať organizátora, aby vás zapísal pod prezývkou namiesto celého mena.</Item>
        </List>
      </Section>
      <Section title="7. Bezpečnosť">
        <P>Používame HTTPS, overený prístup a riadenie prístupu podľa rolí. Prihlásenie a databázu zabezpečuje Supabase. Žiadny systém nie je stopercentne bezpečný; používajte silné a jedinečné heslo a chráňte svoje zariadenie.</P>
      </Section>
      <Section title="8. Údaje detí">
        <P>Služba nie je určená deťom mladším ako 16 rokov. Nezakladajte účty maloletým bez súhlasu, ak ho predpisy vyžadujú.</P>
      </Section>
      <Section title="9. Prenos údajov do zahraničia">
        <P>Údaje ukladá Supabase v Európskej únii (región Štokholm) a aplikáciu doručuje Vercel. Ak niektorý poskytovateľ spracúva údaje mimo EÚ, spoliehame sa na jeho záruky (napríklad štandardné zmluvné doložky).</P>
      </Section>
      <Section title="10. Zmazanie účtu">
        <P>Zmazaním účtu sa odstráni vaše prihlásenie (e-mail, heslo, prepojenie s Google), zobrazované meno, registrácie do turnajov a líg, oprávnenia zapisovateľa a záznamy o predplatnom. Turnaje, ligy a výsledky zápasov, ktorých ste sa zúčastnili alebo ktoré ste organizovali, zostávajú, pretože sú záznamom organizátora o podujatí; vaše meno hráča v týchto výsledkoch zostane viditeľné, ale už nebude prepojené so žiadnym účtom. Zmazanie je okamžité a nedá sa vrátiť späť. Postup krok za krokom: <DeleteLink>Zmazanie účtu</DeleteLink>.</P>
      </Section>
      <Section title="11. Kontakt">
        <P>Otázky k týmto zásadám alebo k vašim údajom{supportEmail ? <> posielajte na <Mail email={supportEmail} /></> : ' môžete poslať prevádzkovateľovi služby cez kontaktné údaje zverejnené na dartlead.app'}.</P>
      </Section>
    </>
  );
}

export function PrivacyPolicy() {
  const { language } = useLanguage();
  const supportEmail = getSupportEmail();
  const isSk = language === 'sk';
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-4 text-foreground md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{isSk ? 'Zásady ochrany osobných údajov' : 'Privacy Policy'}</h1>
        <p className="text-sm text-muted-foreground">{isSk ? 'Posledná aktualizácia: 26. októbra 2026' : 'Last updated: October 26, 2026'}</p>
      </div>
      {isSk ? <PolicySk supportEmail={supportEmail} /> : <PolicyEn supportEmail={supportEmail} />}
    </div>
  );
}
