import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db, auth } from "../../../config/firebaseConfig";

export function useListStats(listId) {
  const [subscribers, setSubscribers] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!listId) return;

    const ref = collection(db, "subscribers");
    const q = query(
      ref,
      where("listId", "==", listId),
      where("userId", "==", auth.currentUser.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSubscribers(data);
      setLoadingStats(false);
    });

    return () => unsub();
  }, [listId]);

  // --- Cálculos ---
  const total = subscribers.length;
  const activos = subscribers.filter((s) => s.status === "subscribed").length;
  const inactivos = subscribers.filter((s) => s.status === "unsubscribed").length;

  const now = new Date();
  const last30 = new Date(now.setDate(now.getDate() - 30));

  const altasMes = subscribers.filter(
    (s) => s.createdAt?.toDate && s.createdAt.toDate() >= last30
  ).length;

  const bajasMes = subscribers.filter(
    (s) =>
      s.status === "unsubscribed" &&
      s.updatedAt?.toDate &&
      s.updatedAt.toDate() >= last30
  ).length;

  return {
    loadingStats,
    total,
    activos,
    inactivos,
    altasMes,
    bajasMes,
    subscribers,
  };
}
