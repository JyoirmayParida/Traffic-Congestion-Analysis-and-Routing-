import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
const firebaseConfig = {
  apiKey: "AIzaSyAighhmSeLznQmNQt1ElLuGV43vrvKuCYU",
  authDomain: "traffic-analysis-and-routing.firebaseapp.com",
  projectId: "traffic-analysis-and-routing",
  storageBucket: "traffic-analysis-and-routing.firebasestorage.app",
  messagingSenderId: "1021093899151",
  appId: "1:1021093899151:web:562f215de3fef9890cf9fa"
};

// Singleton initialization
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
export { app, db };