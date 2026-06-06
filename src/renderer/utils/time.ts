export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) {
    return "Good night";
  }
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 17) {
    return "Good afternoon";
  }
  if (hour < 22) {
    return "Good evening";
  }
  return "Good night";
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}
