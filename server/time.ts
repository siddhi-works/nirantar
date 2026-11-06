/** The calendar date in India. A record dated "today" must mean today for the people using it, not for UTC. */
export const todayIST = (now: Date = new Date()): string => now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
