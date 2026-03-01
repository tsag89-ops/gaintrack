package com.tsag89ops.gaintrack

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions

object FirestoreHelper {

    private val db: FirebaseFirestore by lazy { FirebaseFirestore.getInstance() }

    // ── Write ────────────────────────────────────────────────────────────────

    /** Merge-write a map into users/{uid}/{collection}/{docId}. */
    fun set(
        uid: String,
        collection: String,
        docId: String,
        data: Map<String, Any>,
        onSuccess: () -> Unit = {},
        onError: (Exception) -> Unit = {}
    ) {
        db.collection("users").document(uid)
            .collection(collection).document(docId)
            .set(data, SetOptions.merge())
            .addOnSuccessListener { onSuccess() }
            .addOnFailureListener { onError(it) }
    }

    // ── Read (once) ──────────────────────────────────────────────────────────

    /** Fetch a single document as a raw Map. Returns null if it doesn't exist. */
    fun get(
        uid: String,
        collection: String,
        docId: String,
        onResult: (Map<String, Any>?) -> Unit,
        onError: (Exception) -> Unit = {}
    ) {
        db.collection("users").document(uid)
            .collection(collection).document(docId)
            .get()
            .addOnSuccessListener { snap -> onResult(if (snap.exists()) snap.data else null) }
            .addOnFailureListener { onError(it) }
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    fun delete(
        uid: String,
        collection: String,
        docId: String,
        onSuccess: () -> Unit = {},
        onError: (Exception) -> Unit = {}
    ) {
        db.collection("users").document(uid)
            .collection(collection).document(docId)
            .delete()
            .addOnSuccessListener { onSuccess() }
            .addOnFailureListener { onError(it) }
    }

    // ── Real-time listener ───────────────────────────────────────────────────

    /**
     * Subscribe to live updates of a document.
     * Returns a ListenerRegistration — call .remove() to stop listening.
     */
    fun listen(
        uid: String,
        collection: String,
        docId: String,
        onChange: (Map<String, Any>?) -> Unit,
        onError: (Exception) -> Unit = {}
    ) = db.collection("users").document(uid)
        .collection(collection).document(docId)
        .addSnapshotListener { snap, err ->
            if (err != null) { onError(err); return@addSnapshotListener }
            onChange(if (snap != null && snap.exists()) snap.data else null)
        }
}
