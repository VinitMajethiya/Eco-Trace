/**
 * Date utility helpers for carbon tracking week boundary calculations.
 * Standardized entirely on UTC to ensure behavior is independent of server runtime timezone.
 */

function getISOWeekMonday(date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getWeeklyRanges(todayDate = new Date()) {
  const currentMonday = getISOWeekMonday(todayDate);

  const prevMonday = new Date(currentMonday);
  prevMonday.setUTCDate(currentMonday.getUTCDate() - 7);

  const prevSunday = new Date(currentMonday);
  prevSunday.setUTCDate(currentMonday.getUTCDate() - 1);

  const endCurrentDate = new Date(currentMonday);
  endCurrentDate.setUTCDate(currentMonday.getUTCDate() + 6);

  const formatDate = (d) => d.toISOString().split('T')[0];

  const startCurrent = formatDate(currentMonday);
  const endCurrent = formatDate(endCurrentDate);
  const startPrevious = formatDate(prevMonday);
  const endPrevious = formatDate(prevSunday);

  return { startCurrent, endCurrent, startPrevious, endPrevious };
}

module.exports = {
  getISOWeekMonday,
  getWeeklyRanges
};
