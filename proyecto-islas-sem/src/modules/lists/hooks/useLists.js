import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useAuth } from "../../../shared/hooks/useAuth";

export default function useLists() {
  const { user } = useAuth();
  const [lists, setLists] = useState([]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "lists"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setLists(data);
    });

    return unsubscribe;
  }, [user]);

  const deleteList = (id) => {
    // Aquí pondrás tu lógica real de eliminar
    console.log("Eliminar lista:", id);
  };

  return { lists, deleteList };
}
