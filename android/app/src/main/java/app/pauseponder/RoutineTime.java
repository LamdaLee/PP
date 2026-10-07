package app.pauseponder;

import java.time.*;
import java.util.Set;

/** Pure Java clock logic so repeat/day/zone behavior can be tested without a device. */
final class RoutineTime {
  static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

  static LocalDate today(Instant now) {
    return now.atZone(ZONE).toLocalDate();
  }

  static boolean occurs(LocalDate date, LocalDate start, LocalDate end, Set<Integer> days) {
    return !date.isBefore(start)
        && (end == null || !date.isAfter(end))
        && days.contains(date.getDayOfWeek().getValue());
  }

  static Instant at(LocalDate date, String time) {
    return LocalDateTime.of(date, LocalTime.parse(time)).atZone(ZONE).toInstant();
  }

  static LocalDate next(LocalDate first, LocalDate start, LocalDate end, Set<Integer> days) {
    for (int i = 0; i < 370; i++) {
      LocalDate date = first.plusDays(i);
      if (end != null && date.isAfter(end)) return null;
      if (occurs(date, start, end, days)) return date;
    }
    return null;
  }
}
