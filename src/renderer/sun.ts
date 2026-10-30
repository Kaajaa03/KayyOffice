// Pure sun position: sunrise/sunset from day of year (default location: central Germany).

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';
export interface SunTimes { sunrise: number; sunset: number }

const RAD = Math.PI / 180;

/** Local clock hours of sunrise/sunset. tzOffsetMin = Date#getTimezoneOffset() (CEST = -120). */
export function sunTimes(dayOfYear: number, tzOffsetMin: number, lat = 51, lon = 10): SunTimes {
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b); // minutes
  const cosH = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD)) / (Math.cos(lat * RAD) * Math.cos(decl * RAD));
  const half = Math.acos(Math.min(1, Math.max(-1, cosH))) / RAD / 15;
  const noon = 12 - lon / 15 - eot / 60 - tzOffsetMin / 60;
  return { sunrise: noon - half, sunset: noon + half };
}

export function dayPhaseAt(hour: number, sun: SunTimes): DayPhase {
  if (hour < sun.sunrise - 0.5 || hour >= sun.sunset + 0.5) return 'night';
  if (hour < sun.sunrise + 1) return 'dawn';
  if (hour < sun.sunset - 1) return 'day';
  return 'dusk';
}

export function dayPhase(date: Date): DayPhase {
  const start = new Date(date.getFullYear(), 0, 0);
  const doy = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return dayPhaseAt(date.getHours() + date.getMinutes() / 60, sunTimes(doy, date.getTimezoneOffset()));
}
