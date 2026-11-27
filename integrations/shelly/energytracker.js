/* global Shelly, Timer */
// EnergyTracker — sterowanie gniazdkiem/przekaźnikiem Shelly według ceny lub emisyjności prądu.
//
// Działa na urządzeniach Shelly Gen2 i nowszych (Plus, Pro, Gen3, Gen4) bez chmury,
// bez Home Assistanta i bez naszego serwera: skrypt co 15 minut pobiera lekki plik
// feed.json z danymi dla Twojej strefy i sam włącza lub wyłącza wyjście.
//
// Instalacja: interfejs WWW urządzenia → Scripts → Create script → wklej → Save → Start,
// i włącz „Run on startup”. Ustawienia poniżej.
//
// Uwaga na pralki i zmywarki: wiele z nich po przywróceniu zasilania nie wznawia
// programu. Skrypt najlepiej pasuje do urządzeń, które po prostu pracują pod
// napięciem: bojler, grzejnik, mata grzewcza, osuszacz, ładowarka akumulatorów.

let CONFIG = {
  // Strefa: pl, de, fr, cz…
  zone: 'pl',
  // Tryb:
  //  'window'   — włącz na najlepsze okno `hours` godzin w ciągu najbliższej doby (np. bojler 3 h)
  //  'rank'     — włącz, gdy bieżąca godzina jest wśród `share` najtańszych znanych godzin (0.25 = 25%)
  //  'below'    — włącz, gdy cena hurtowa < `maxPrice` (zł/kWh lub €/kWh)
  //  'clean'    — jak 'window', ale według najniższej emisyjności CO₂ zamiast ceny
  mode: 'window',
  hours: 3,
  share: 0.25,
  maxPrice: 0.3,
  // Które wyjście sterować (0 dla gniazdek i przekaźników jednokanałowych).
  switchId: 0,
  // Co zrobić, gdy przez `failsafeHours` nie uda się pobrać danych: true = włącz, false = wyłącz.
  failsafeOn: true,
  failsafeHours: 6,
  // Co ile minut sprawdzać.
  everyMinutes: 15,
  url: 'https://raw.githubusercontent.com/Jupik23/EnergyTracker/data/v1/',
};

let state = { lastOk: 0, latchStart: 0, latchEnd: 0 };

// "2026-11-27T02:00:00.000Z" -> sekundy UNIX (tylko UTC, jak w feedzie).
function parseIso(s) {
  let y = Number(s.slice(0, 4));
  let mo = Number(s.slice(5, 7));
  let d = Number(s.slice(8, 10));
  let h = Number(s.slice(11, 13));
  let mi = Number(s.slice(14, 16));
  // Dni od 1970-01-01 (algorytm „days from civil”).
  y -= mo <= 2 ? 1 : 0;
  let era = Math.floor(y / 400);
  let yoe = y - era * 400;
  let doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  let doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  let days = era * 146097 + doe - 719468;
  return days * 86400 + h * 3600 + mi * 60;
}

function nowUnix() {
  return Shelly.getComponentStatus('sys').unixtime;
}

function setOutput(on, why) {
  Shelly.call('Switch.Set', { id: CONFIG.switchId, on: on });
  print('EnergyTracker: ' + (on ? 'ON' : 'OFF') + ' — ' + why);
}

function decide(feed) {
  let now = nowUnix();
  if (CONFIG.mode === 'rank') {
    let r = feed.now.priceRank;
    if (r === null) return setOutput(CONFIG.failsafeOn, 'brak ceny dla bieżącej godziny');
    return setOutput(r <= CONFIG.share, 'pozycja ceny ' + r);
  }
  if (CONFIG.mode === 'below') {
    let p = feed.now.price;
    if (p === null) return setOutput(CONFIG.failsafeOn, 'brak ceny dla bieżącej godziny');
    return setOutput(p < CONFIG.maxPrice, 'cena ' + p + ' ' + feed.currency + '/kWh');
  }
  // 'window' / 'clean': trzymaj się raz wybranego okna, dopóki się nie skończy —
  // okno „najbliższej doby” przesuwa się co kwadrans i bez tego mogłoby uciekać.
  if (now < state.latchEnd) {
    return setOutput(now >= state.latchStart, 'okno ' + state.latchStart + '–' + state.latchEnd);
  }
  let w = (CONFIG.mode === 'clean' ? feed.cleanest : feed.cheapest)['' + CONFIG.hours];
  if (!w) return setOutput(CONFIG.failsafeOn, 'brak okna w danych');
  state.latchStart = parseIso(w.start);
  state.latchEnd = parseIso(w.end);
  setOutput(now >= state.latchStart && now < state.latchEnd, 'nowe okno ' + w.start + '–' + w.end);
}

function tick() {
  Shelly.call('HTTP.GET', { url: CONFIG.url + CONFIG.zone + '/feed.json', timeout: 20 }, function (res, err) {
    if (err === 0 && res && res.code === 200) {
      let feed = null;
      try {
        feed = JSON.parse(res.body);
        // eslint-disable-next-line no-unused-vars -- Shelly JS has no optional catch binding
      } catch (e) {
        feed = null;
      }
      if (feed && feed.v === 1) {
        state.lastOk = nowUnix();
        decide(feed);
        return;
      }
    }
    print('EnergyTracker: nie udało się pobrać danych (' + err + ')');
    if (state.lastOk > 0 && nowUnix() - state.lastOk > CONFIG.failsafeHours * 3600) {
      setOutput(CONFIG.failsafeOn, 'tryb awaryjny');
    }
  });
}

Timer.set(CONFIG.everyMinutes * 60 * 1000, true, tick);
tick();
