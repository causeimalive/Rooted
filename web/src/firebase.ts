import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyD2pI0eiW11jNAb2sb_okdIfVcss_Ph3Ss',
  authDomain: 'rootedinchrist-faith-2026.firebaseapp.com',
  projectId: 'rootedinchrist-faith-2026',
  storageBucket: 'rootedinchrist-faith-2026.firebasestorage.app',
  messagingSenderId: '14984934334',
  appId: '1:14984934334:web:1675191ad699c7958effef',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
