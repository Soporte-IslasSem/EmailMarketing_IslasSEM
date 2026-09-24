import { addDoc, collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useEffect, useState } from "react";

export default function useSubscribers(listId = null) {
  const { user } = useAuth();
  const [subscribers, setSubscribers] = useState([]);

  useEffect(() => {
    if (!user || !listId) return;

    const q = query(
      collection(db, "subscribers"),
      where("userId", "==", user.uid),
      where("listId", "==", listId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));
      setSubscribers(data);
    });

    return () => unsubscribe();
  }, [user, listId]);

  const addSubscriber = async (email, name, listId) => {
    if (!user) return;

    await addDoc(collection(db, "subscribers"), {
      email,
      name,
      listId,
      userId: user.uid,
      createdAt: new Date()
    });
  };

  const deleteSubscriber = async (id) => {
    await deleteDoc(doc(db, "subscribers", id));
  };

  return { subscribers, addSubscriber, deleteSubscriber };
}
