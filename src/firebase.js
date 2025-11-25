import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // <--- ADD THIS IMPORT

// KEEP YOUR EXISTING CONFIGURATION HERE
// (Do not replace these lines with "...", use your actual keys)
const firebaseConfig = {
  apiKey: "AIzaSyCM3ok8jReZE7XHqlWH8m3iCQKZurNAWPA",
  authDomain: "studio-tracker-708cf.firebaseapp.com",
  projectId: "studio-tracker-708cf",
  storageBucket: "studio-tracker-708cf.firebasestorage.app",
  messagingSenderId: "550530422110",
  appId: "1:550530422110:web:44e8684b34ca496c746bcf"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const db = getFirestore(app);
export const auth = getAuth(app); // <--- ADD THIS EXPORT LINE