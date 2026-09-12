export function addMinutesToArrivalTime(
  durationMinutes: number,
  now = new Date(),
): string {
  const arrival = new Date(now.getTime() + durationMinutes * 60_000);

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(arrival);
}

