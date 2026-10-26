# Device Management (Správa zariadení pre turnaje)

## Prehľad

Táto funkcia umožňuje rozlíšiť medzi zariadeniami (tabletmi) na turnaji, aj keď je na všetkých prihlásený ten istý používateľ. Každé zariadenie môže mať:

- **Číslo terča** (Board Number) - napr. 1, 2, 3...
- **Názov zariadenia** (Device Name) - napr. "Tablet pri okne", "Hlavný terč"
- **Obľúbené skupiny** - skupiny ktoré sa zobrazujú prednostne na danom zariadení

## Ako to funguje

### 1. Automatické Device ID
Každé zariadenie automaticky dostane unikátny `deviceId` pri prvej návšteve aplikácie. Tento ID je uložený v `localStorage` a zostáva rovnaký aj po prihlásení/odhlásení.

```
device_1707235200000_abc123def
```

### 2. Manuálne nastavenie zariadenia
Používateľ môže nastaviť:
- **Číslo terča** - zobrazuje sa pri live zápasoch
- **Názov zariadenia** - pre ľahšiu identifikáciu

### 3. Zobrazenie pri live zápasoch
Na stránke s live zápasmi turnaja sa zobrazuje číslo terča pri každom aktívnom zápase:

```
┌─────────────────────────────────┐
│ [🎯 Terč 1]              [LIVE] │
├─────────────────────────────────┤
│ Jan Novák           3    301   │
│ Peter Kováč         2    180   │
├─────────────────────────────────┤
│ Skupina A • First to 3         │
└─────────────────────────────────┘
```

## Nastavenie zariadenia

1. Otvorte navigačné menu
2. Kliknite na tlačidlo **"Zariadenie"** (alebo ikonu monitora s číslom terča)
3. Vyplňte:
   - **Názov zariadenia** (voliteľné)
   - **Číslo terča** (odporúčané pre turnaje)
4. Kliknite na **"Uložiť"**

## Databázové stĺpce

V tabuľke `matches` sú tieto stĺpce pre sledovanie zariadení:

| Stĺpec | Typ | Popis |
|--------|-----|-------|
| `live_device_id` | VARCHAR(255) | Unikátny identifikátor zariadenia |
| `live_device_name` | VARCHAR(100) | Názov zariadenia (voliteľné) |
| `live_board_number` | INTEGER | Číslo terča (1-99) |
| `live_started_at` | TIMESTAMP | Kedy zápas začal live |

## SQL Migrácia

Spustite tento SQL skript v Supabase SQL Editor:

```sql
-- Pridať stĺpce pre informácie o zariadení
ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_device_name VARCHAR(100);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_board_number INTEGER;

-- Komentáre
COMMENT ON COLUMN matches.live_device_name IS 'User-friendly name of the device running the match';
COMMENT ON COLUMN matches.live_board_number IS 'Board/target number where the match is being played';

-- Index pre rýchlejšie vyhľadávanie
CREATE INDEX IF NOT EXISTS idx_matches_board_number ON matches(live_board_number) WHERE live_board_number IS NOT NULL;
```

Tieto stĺpce už vytvárajú migrácie v `supabase/migrations/`.

## Použitie v kóde

### Prístup k device info v komponentoch

```jsx
import { useLiveMatch } from '../contexts/LiveMatchContext';

function MyComponent() {
  const { deviceId, deviceName, boardNumber, setDeviceInfo } = useLiveMatch();
  
  // Zobraziť aktuálne info
  console.log(`Zariadenie: ${deviceName}, Terč: ${boardNumber}`);
  
  // Zmeniť nastavenia
  const handleSave = () => {
    setDeviceInfo("Tablet pri okne", 2);
  };
}
```

### DeviceBadge komponent

Pre zobrazenie badge s číslom terča:

```jsx
import { DeviceBadge } from './DeviceSettings';

<DeviceBadge 
  boardNumber={3} 
  deviceName="Hlavný tablet" 
  compact={false} 
/>
```

## Scenár turnaja

1. **Príprava**: Na každom tablete nastavte číslo terča (1, 2, 3...)
2. **Prihlásenie**: Prihláste sa rovnakým účtom na všetkých tabletoch
3. **Zápasy**: Pri spustení zápasu sa automaticky priradí k danému terču
4. **Sledovanie**: Na hlavnej obrazovke vidíte ktorý zápas beží na ktorom terči

## Obľúbené skupiny

Zariadenie si môže "pripnúť" skupiny, ktoré sa potom zobrazujú prednostne:

### Ako pripnúť skupinu

1. Otvorte turnaj
2. V sekcii **Skupiny** alebo **Zápasy** kliknite na ⭐ hviezdu pri názve skupiny
3. Pripnuté skupiny sa zobrazia:
   - **Na začiatku zoznamu** (pred ostatnými skupinami)
   - **S vizuálnym označením** (zlatý okraj, hviezda)
   - **Vo filtri zápasov** ako možnosť "⭐ Obľúbené skupiny"

### Príklad použitia

Ak máte tablet pri Terči 1, pripnite si skupinu A a B. Na danom tablete:
- V sekcii Skupiny budú A a B hore
- V sekcii Zápasy môžete filtrovať na "Obľúbené skupiny"
- Jednoduchšie nájdete zápasy pre váš terč

### API v kóde

```jsx
import { useLiveMatch } from '../contexts/LiveMatchContext';

function MyComponent() {
  const { 
    toggleFavoriteGroup,    // Prepne obľúbenosť skupiny
    isGroupFavorite,        // Či je skupina obľúbená
    getFavoriteGroups,      // Zoznam ID obľúbených skupín
    hasFavoriteGroups,      // Či turnaj má obľúbené skupiny
    clearFavoriteGroups     // Vymaže všetky obľúbené pre turnaj
  } = useLiveMatch();
  
  // Príklady
  toggleFavoriteGroup('tournament-123', 'group-456');
  const isFav = isGroupFavorite('tournament-123', 'group-456');
  const favorites = getFavoriteGroups('tournament-123');
}
```

## Technické detaily

- Device info je uložené v `localStorage` pod kľúčom `darts-device-info`
- Obľúbené skupiny sú uložené v `localStorage` pod kľúčom `darts-favorite-groups`
- Pri štarte zápasu sa info posiela do databázy
- Pri ukončení zápasu sa info vymaže z databázového záznamu
- Realtime updates cez Supabase subscriptions
