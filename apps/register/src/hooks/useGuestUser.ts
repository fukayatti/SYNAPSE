
import { useState, useEffect } from "react";

function generateSimpleId() {
  return "usr_" + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}

export function useGuestUser() {
  const [userId, setUserId] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let storedId = localStorage.getItem("fes_guest_user_id");
    if (!storedId) {
      storedId = generateSimpleId();
      localStorage.setItem("fes_guest_user_id", storedId);
    }
    setUserId(storedId);
    setIsLoaded(true);
  }, []);

  return { userId, isLoaded };
}
