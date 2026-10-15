type SlotLike = {
  start_time: string | Date;
  end_time?: string | Date | null;
  host?: { name?: string | null } | null;
};

function toDate(value: string | Date | null | undefined) {
  return value instanceof Date ? value : new Date(value ?? "");
}

export function isFutureTimeSlot(
  slot: Pick<SlotLike, "start_time">,
  now = new Date(),
) {
  return toDate(slot.start_time).getTime() > now.getTime();
}

export function filterFutureTimeSlots<
  T extends Pick<SlotLike, "start_time">,
>(slots: T[], now = new Date()) {
  return slots.filter((slot) => isFutureTimeSlot(slot, now));
}

export function formatTimeSlotWindow(
  slot: Pick<SlotLike, "start_time" | "end_time">,
) {
  const start = toDate(slot.start_time);
  const end = toDate(slot.end_time ?? slot.start_time);

  return `${start.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })} - ${end.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function formatTimeSlotDate(slot: Pick<SlotLike, "start_time">) {
  return toDate(slot.start_time).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
