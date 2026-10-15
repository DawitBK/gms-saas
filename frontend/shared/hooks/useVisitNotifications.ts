"use client";

import { useEffect, useRef } from "react";
import { useVisitsList } from "@features/visits/hooks";
import { format, differenceInMinutes, isAfter, isBefore, addMinutes } from "date-fns";
import { toast } from "sonner";

/**
 * useVisitNotifications
 * 
 * Monitors the approved visits queue and triggers browser-native notifications
 * when a visit is nearing its scheduled start time (e.g., within 15 minutes).
 */
export function useVisitNotifications() {
  const { data: visitsData } = useVisitsList({
    page: 1,
    limit: 50,
    status: "APPROVED",
  });

  const notifiedVisits = useRef<Set<number>>(new Set());

  useEffect(() => {
    // Request notification permission on mount
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  useEffect(() => {
    if (!visitsData?.data) return;

    const now = new Date();
    const windowEnd = addMinutes(now, 15);

    visitsData.data.forEach((visit) => {
      if (notifiedVisits.current.has(visit.id)) return;

      const startTime = new Date(visit.scheduled_start);
      
      // Check if visit is within the next 15 minutes and hasn't started yet
      if (isAfter(startTime, now) && isBefore(startTime, windowEnd)) {
        const guestName = visit.guest?.name || "A guest";
        const timeStr = format(startTime, "HH:mm");
        const title = "Upcoming Visit Reminder";
        const body = `${guestName} is scheduled to arrive at ${timeStr}.`;

        // Browser Native Notification
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification(title, {
            body,
            icon: "/favicon.ico", // Fallback icon
          });
        }

        // In-app Toast
        toast(title, {
          description: body,
          action: {
            label: "View Visit",
            onClick: () => {
              // We could open the visit modal here if we had access to management store
              // but for now just a link or toast is good.
              window.focus();
            }
          }
        });

        notifiedVisits.current.add(visit.id);
      }
    });
  }, [visitsData?.data]);
}
