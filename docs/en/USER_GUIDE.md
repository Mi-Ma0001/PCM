# User guide — CMS Maintenance Plan

*Version française : [../USER_GUIDE.md](../USER_GUIDE.md). The application interface is in French; menu names are quoted in French below.*

## 1. Overview

The app computes **when each machine of an SMT (CMS) production line needs preventive maintenance**. It spreads the work between technicians and flags problems: overdue items, overloaded weeks, and two jobs on the same day.

It applies exactly the rules of the Excel/VBA workbook. There are two kinds of periodicity:
- **Time-based** ("Temporelle"), e.g. every 3 months. Dates are computed from the last intervention.
- **Usage-based** ("Usage"), e.g. every 500 hours. The app estimates the date from the average daily use.

Your data stays **on your device**. No account is needed.

The colours mean the same thing in every tab:

| Colour | Meaning |
|---|---|
| Green | Planned ("Planifiée") |
| Yellow | Watch ("À surveiller") or To decide ("À arbitrer") |
| Pink | Overdue ("En retard") |
| Red | Critical delay ("Retard critique") or workload CONFLICT |
| Grey | Missing data ("À définir") |

## 2. Install

| Platform | How |
|---|---|
| **PC** (Windows, macOS, Linux) | Open the app URL in Chrome or Edge, then click **"Installer l'application"** in the green header, or the install icon in the address bar |
| **Android, PWA** | Chrome menu ⋮, then **Install app** |
| **Android, APK** | Download the APK from GitHub (**Actions** or **Releases**), open it, allow installation from this source, then **Install** |
| **iPhone / iPad** | Safari, then **Share**, then **Add to Home Screen** (no App Store version) |

Details are in [../INSTALLATION.md](../INSTALLATION.md) (in French).

## 3. Tabs

| Tab | What it does |
|---|---|
| **Tableau de bord** (Dashboard) | Key figures, priority actions, next 30 days, interventions per week (red bar = conflict week) |
| **Équipements** (Machines) | Add, edit or delete a machine, with its maintenance operations. A delete can be undone from the notification |
| **Calcul** | Next due date and the 4 following dates. For usage machines: target counter, remaining hours, average use |
| **Planning** | Every intervention over the horizon, with filters, search and **CSV export** (opens in Excel) |
| **Charge** (Workload) | Hours per technician per week versus capacity, plus a 53-week table |
| **Conflits** | All checks: overdue, counter near threshold, overloaded weeks, same-day jobs (with a rescheduling proposal) |
| **Gantt** | One row per machine, one column per ISO week |
| **Tests** | The 19 engine checks. The expected result is **19 / 19** |
| **Paramètres** (Settings) | Calculation settings, JSON backup and restore, optional sync |

**After a maintenance job:**
- for a time-based machine, update the **last intervention date** ("Dernière intervention") ;
- for a usage-based machine, also copy the current counter into **last counter** ("Dernier compteur").

## 4. Settings

| Setting | Role | Default |
|---|---|---|
| Weekly capacity | Hours available per technician per week | 8 |
| Counter alert | Threshold in hours for "À surveiller" | 100 |
| Horizon | Length of the planning, in months | 12 |
| Future dates | Number of due dates shown in the Calcul tab | 4 |
| Delay threshold | Days of tolerance before "En retard" | 0 |
| Max interventions per week | Above this, the week is in conflict | 3 |
| Reference date | Empty means today. Set 2026-10-16 to reproduce the Excel results | empty |

## 5. Backup and restore

- Every change is **saved automatically** on the device. The header shows "Enregistré HH:MM".
- **"Exporter les données (JSON)"** saves a backup file. On Android, you then choose where to store it.
- **"Importer un fichier JSON"** restores a backup.
  - Invalid files are rejected, with a list of the problems.
  - An import can be undone.
- A **safety copy** is kept automatically before every import or reset.

## 6. Sync between devices (optional)

When enabled by the administrator, **Paramètres → "Synchronisation entre appareils"** lets you:
- create an account or sign in ;
- keep the same plan on your PC and your phone.

If the plan was changed on two devices, the app asks which version to keep. Nothing is overwritten silently. The app keeps working offline and syncs again when the connection returns.

## 7. Updates

- **PWA and browser**: a **"Mettre à jour"** button appears when a new version is published. Your data is kept.
- **APK**: install the new APK over the old one.

## 8. Troubleshooting and support

See [../TROUBLESHOOTING.md](../TROUBLESHOOTING.md) (in French). Report problems in the GitHub repository's **Issues** tab.
