import { createContext, useContext } from 'react'

// 'owner' (Chef – sieht Kosten/Auswertung) | 'worker' (Mitarbeiter – nur Zeit erfassen)
export const RoleContext = createContext('owner')
export const useRole = () => useContext(RoleContext)
