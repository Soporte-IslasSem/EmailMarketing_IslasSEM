import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "../../../config/firebaseConfig";
import { useAuth } from "../../../shared/hooks/useAuth";
import { useEffect, useState } from "react";
import { useOrg } from "../../crm/lib/useOrg";
import { isTypeList, addEmailsToTypeList, normEmail, EMAIL_RE } from "../../lists/lib/crmLink";

export default function useSubscribers(listId = null) {
  const { user } = useAuth();
  const { orgId } = useOrg();
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

  // Lista de un tipo de cliente (CRM y Email Marketing son una sola base): la persona queda
  // como contacto del CRM con ese tipo y la suscripción la crea la sincronización (useCrmLink).
  // Otras listas: alta normal, sin duplicar el email.
  const addSubscriber = async (rawEmail, name, listId) => {
    if (!user) return;
    const email = normEmail(rawEmail);
    if (!EMAIL_RE.test(email)) throw new Error("Email no válido");
    const snap = await getDoc(doc(db, "lists", listId));
    const list = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    if (!list) throw new Error("Lista no encontrada");
    if (isTypeList(list)) {
      await addEmailsToTypeList(list, [{ email, name }], orgId);
      return;
    }
    const dup = await getDocs(query(collection(db, "subscribers"), where("listId", "==", listId), where("userId", "==", user.uid), where("email", "==", email)));
    if (!dup.empty) return;
    await addDoc(collection(db, "subscribers"), {
      email,
      ...(name ? { name: String(name).trim() } : {}),
      listId,
      userId: user.uid,
      status: "subscribed",
      source: "manual",
      createdAt: new Date()
    });
    await updateDoc(doc(db, "lists", listId), { subscribersCount: increment(1) });
  };

  const deleteSubscriber = async (id) => {
    await deleteDoc(doc(db, "subscribers", id));
  };

  return { subscribers, addSubscriber, deleteSubscriber };
}
