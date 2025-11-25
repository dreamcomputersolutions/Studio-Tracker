// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  // PASTE YOUR CONFIG HERE
    apiKey: "AIzaSyCM3ok8jReZE7XHqlWH8m3iCQKZurNAWPA",
    authDomain: "studio-tracker-708cf.firebaseapp.com",
    projectId: "studio-tracker-708cf",
    storageBucket: "studio-tracker-708cf.firebasestorage.app",
    messagingSenderId: "550530422110",
    appId: "1:550530422110:web:44e8684b34ca496c746bcf"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);