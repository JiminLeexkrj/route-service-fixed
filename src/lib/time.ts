export function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatClock(date: Date, includeSeconds = false) {
  const base = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return includeSeconds ? `${base}:${pad(date.getSeconds())}` : base;
}

export function toDateTimeLocalValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${formatClock(date)}`;
}

export function getDefaultDeadline() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 45, 0, 0);
  return toDateTimeLocalValue(date);
}

export function clockFromDateTimeLocal(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(-5) : formatClock(date);
}

export function addMinutesToClock(clock: string, minutes: number) {
  const [hours = 0, mins = 0] = clock.split(":").map(Number);
  const total = (hours * 60 + mins + minutes + 1440 * 2) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function minutesBetweenClocks(current: string, target: string) {
  const [currentHours = 0, currentMinutes = 0] = current
    .split(":")
    .map(Number);
  const [targetHours = 0, targetMinutes = 0] = target.split(":").map(Number);
  const currentTotal = currentHours * 60 + currentMinutes;
  const targetTotal = targetHours * 60 + targetMinutes;
  const difference = targetTotal - currentTotal;
  return difference < -720 ? difference + 1440 : difference;
}

export function formatRemaining(minutes: number) {
  if (minutes <= 0) return "마감 지남";
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

export function formatDeadlineDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "오늘";

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return `${date.getMonth() + 1}월 ${date.getDate()}일${isToday ? " · 오늘" : ""}`;
}

