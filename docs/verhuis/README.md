# Van Bookwidgetzzz naar Boosterz: de repository hernoemen

De app heet al Boosterz; alleen de repository en dus het webadres dragen nog de oude naam.

## Wat er gebeurt bij het hernoemen

- Het webadres wordt `https://thomasteamict.github.io/Boosterz/`. Het oude adres
  `…/Bookwidgetzzz/` geeft daarna een 404, tenzij je de doorverwijzing hieronder plaatst.
- De gegevens van leerkrachten en leerlingen blijven staan: de browser bewaart ze per
  domein (`thomasteamict.github.io`), niet per pad.
- De app zelf heeft geen aanpassing nodig: ze laadt haar bestanden relatief (`base: './'`).
- Git-verwijzingen naar de oude repository stuurt GitHub automatisch door, zolang er geen
  nieuwe repository met de oude naam bestaat.

## Stappen

1. GitHub → repository `Bookwidgetzzz` → Settings → General → Repository name: `Boosterz` → Rename.
2. Actions → "Deploy naar GitHub Pages" → Run workflow, zodat de site meteen op het nieuwe adres staat.
3. Optioneel, maar aangeraden als er al links of QR-codes in omloop zijn: maak een nieuwe,
   openbare repository `Bookwidgetzzz` met daarin `index.html` en `404.html`, allebei een kopie van
   `docs/verhuis/index.html`. Zet GitHub Pages aan voor die repository (branch `main`, map `/`).
   Elk oud adres, ook met een `#/…`-route of een klaslink, gaat dan door naar hetzelfde adres
   onder `/Boosterz/`.
   Let op: zodra die nieuwe repository bestaat, stuurt GitHub git-verwijzingen naar de oude naam
   niet meer door. Zet in lokale klonen de remote op de nieuwe naam:
   `git remote set-url origin https://github.com/ThomasTeamICT/Boosterz.git`.
