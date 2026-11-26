// @ts-nocheck
// Ported from landing-3d/live/kit/sun.js (27 Oct 2026). Plain JS under a type pass: three.js has no types here.
// The sun's position after NOAA's solar calculator (the "General Solar Position" spreadsheet: Meeus's
// low-precision formulae with the equation of time and atmospheric refraction), and a key-light colour that
// warms as the sun gets low. Angles in degrees; azimuth is compass (from north, clockwise), as stage.js's
// setKey takes it.
const rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;

/** { el, az, sunrise, sunset, solarNoon } for a local date and time; tz in hours east of UTC (CDT is -5).
 *  sunrise, sunset and solarNoon are local decimal hours. */
export function noaaSun({ y, mo, d, h, min = 0, tz, lat, lon }) {
  const jd0 = Date.UTC(y, mo - 1, d) / 86400000 + 2440587.5; // Julian day at 0 h UTC of that date
  const frac = (h + min / 60) / 24;
  const JD = jd0 + frac - tz / 24;
  const T = (JD - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
  const om = 125.04 - 1934.136 * T;
  const app = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(om));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(om));
  const dec = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(app))));
  const yv = Math.tan(rad(eps / 2)) ** 2;
  const eot = 4 * deg(yv * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * yv * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
    - 0.5 * yv * yv * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M)));
  const tst = (((frac * 1440 + eot + 4 * lon - 60 * tz) % 1440) + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const cz = Math.sin(rad(lat)) * Math.sin(rad(dec)) + Math.cos(rad(lat)) * Math.cos(rad(dec)) * Math.cos(rad(ha));
  const zen = deg(Math.acos(Math.max(-1, Math.min(1, cz))));
  let el = 90 - zen;
  const te = Math.tan(rad(el));
  const refr = el > 85 ? 0 : el > 5 ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
    : el > -0.575 ? 1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711))) : -20.772 / te;
  el += refr / 3600;
  const ca = (Math.sin(rad(lat)) * Math.cos(rad(zen)) - Math.sin(rad(dec))) / (Math.cos(rad(lat)) * Math.sin(rad(zen)));
  const a = deg(Math.acos(Math.max(-1, Math.min(1, ca))));
  const az = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
  const haS = deg(Math.acos(Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(dec))) - Math.tan(rad(lat)) * Math.tan(rad(dec))));
  const noon = (720 - 4 * lon - eot + tz * 60) / 1440;
  return { el, az, dec, eot, solarNoon: noon * 24, sunrise: (noon - (haS * 4) / 1440) * 24, sunset: (noon + (haS * 4) / 1440) * 24 };
}

/** The key light's colour and strength for a sun elevation: warm and weak near the horizon, near-white high up.
 *  Returns null below the horizon (night). */
export function sunLight(el) {
  if (el <= 0) return null;
  const k = Math.min(1, el / 60); // 0 at the horizon, 1 from 60 degrees up
  // between a low-sun amber and a high-sun warm white, eased so mid-morning is still visibly warm
  const lo = [255, 196, 140], hi = [255, 246, 234];
  const t = Math.pow(k, 0.7);
  const c = lo.map((v, i) => Math.round(v + (hi[i] - v) * t));
  const hex = '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  return { color: hex, intensity: 1.6 + 1.3 * Math.sin(rad(Math.min(90, el))) };
}
