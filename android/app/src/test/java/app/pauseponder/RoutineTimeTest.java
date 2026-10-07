package app.pauseponder;

import static org.junit.Assert.*;

import java.time.*;
import java.util.*;
import org.junit.Test;

public class RoutineTimeTest {
  @Test
  public void koreaMidnight() {
    assertEquals(
        LocalDate.parse("2026-10-08"), RoutineTime.today(Instant.parse("2026-10-07T15:00:00Z")));
    assertEquals(
        Instant.parse("2026-10-07T23:00:00Z"),
        RoutineTime.at(LocalDate.parse("2026-10-08"), "08:00:00"));
  }

  @Test
  public void weekdaysAndPeriod() {
    Set<Integer> days = new HashSet<>(Arrays.asList(1, 3, 5));
    LocalDate start = LocalDate.parse("2026-10-07"), end = LocalDate.parse("2026-10-09");
    assertTrue(RoutineTime.occurs(start, start, end, days));
    assertFalse(RoutineTime.occurs(start.plusDays(1), start, end, days));
    assertNull(RoutineTime.next(end.plusDays(1), start, end, days));
    assertEquals(end, RoutineTime.next(start.plusDays(1), start, end, days));
  }
}
