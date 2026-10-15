"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { apiClient } from "@shared/lib/api-client";
import { assetPath } from "@shared/lib/asset-path";

/** `useSyncExternalStore` subscribe for a value that never changes after mount. */
const SUBSCRIBE_NEVER = () => () => {};

function getPushSupportSnapshot() {
  return (
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}
const NOT_SUPPORTED_ON_SERVER = () => false;

export function usePushNotifications() {
  // Browser capability and the current permission grant are both read through
  // useSyncExternalStore rather than setState-d in from a mount effect: they
  // have no value during SSR, which is exactly what the server snapshot is
  // for, and react-hooks/set-state-in-effect (an error under
  // eslint-config-next 16) rejects the effect form.
  const isSupported = useSyncExternalStore(
    SUBSCRIBE_NEVER,
    getPushSupportSnapshot,
    NOT_SUPPORTED_ON_SERVER,
  );
  // The permission the browser currently reports, and any newer value returned
  // by requestPermission() in this session (which does not change what the
  // snapshot above reads until a reload).
  const [requestedPermission, setRequestedPermission] = useState<NotificationPermission | null>(null);
  const browserPermission = useSyncExternalStore(
    SUBSCRIBE_NEVER,
    () => (getPushSupportSnapshot() ? Notification.permission : "default"),
    () => "default" as NotificationPermission,
  );
  const permission = requestedPermission ?? browserPermission;
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const subscribe = useCallback(async () => {
    if (!isSupported || isLoading) return;
    setIsLoading(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setRequestedPermission(nextPermission);
      if (nextPermission !== "granted") return;

      const registration = await navigator.serviceWorker.register(assetPath("/sw.js"));
      await navigator.serviceWorker.ready;

      const { data } = await apiClient.get("/notifications/vapid-public-key");
      const vapidKey = data.data?.publicKey;
      if (!vapidKey) return;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await apiClient.post("/notifications/push-subscription", {
        subscription: subscription.toJSON(),
      });
      setIsSubscribed(true);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isSupported]);

  const unsubscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.getRegistration(assetPath("/sw.js"));
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await apiClient.delete("/notifications/push-subscription", {
        data: { endpoint: subscription.endpoint },
      });
    }
    setIsSubscribed(false);
  }, []);

  return { permission, isSubscribed, isSupported, isLoading, subscribe, unsubscribe };
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(b64)].map((char) => char.charCodeAt(0)));
}
