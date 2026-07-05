import { isDemoMode, supabase } from './supabaseClient'
import {
  mockBadges, mockCompliments, mockDepartments, mockEventMembers,
  mockEvents, mockHoneyPoints, mockProfiles
} from './mockData'
import { badgesFromStats, getHiveLevel } from './levels'
import type {
  Badge, Compliment, Department, EventItem, EventMember, HoneyPoint, Profile, ProfileStats
} from './types'

// ---------- Estado em memória para o modo demonstração ----------
const demoState = {
  departments: [...mockDepartments],
  profiles: [...mockProfiles],
  events: [...mockEvents],
  eventMembers: [...mockEventMembers],
  honeyPoints: [...mockHoneyPoints],
  compliments: [...mockCompliments],
  badges: [...mockBadges]
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------- Departamentos ----------
export async function listDepartments(): Promise<Department[]> {
  if (isDemoMode) return demoState.departments
  const { data, error } = await supabase.from('departments').select('*').order('name')
  if (error) throw error
  return data as Department[]
}

// ---------- Perfis ----------
export async function listProfiles(): Promise<Profile[]> {
  if (isDemoMode) return demoState.profiles.filter((p) => p.onboarding_completed)
  const { data, error } = await supabase.from('profiles').select('*').eq('onboarding_completed', true)
  if (error) throw error
  return data as Profile[]
}

export async function getProfileById(id: string): Promise<Profile | null> {
  if (isDemoMode) return demoState.profiles.find((p) => p.id === id) ?? null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function upsertProfile(profile: Partial<Profile> & { id: string }): Promise<Profile> {
  if (isDemoMode) {
    const idx = demoState.profiles.findIndex((p) => p.id === profile.id)
    if (idx >= 0) {
      demoState.profiles[idx] = { ...demoState.profiles[idx], ...profile }
      return demoState.profiles[idx]
    }
    const blank: Profile = {
      id: profile.id, first_name: '', last_name: '', birth_date: null, cpf: null, phone: null,
      email: profile.email ?? '', city: null, state: null, mother_name: null, father_name: null,
      emergency_contact_name: null, emergency_contact_phone: null, department_id: null, role: null,
      experience_level: null, entry_date: null, work_location: null, skills: [], health_conditions: null,
      allergies: null, important_notes: null, about_me: null, fun_fact: null, favorite_events: null,
      instagram: null, personal_quote: null, avatar_url: null, onboarding_completed: false,
      created_at: new Date().toISOString(), ...profile
    }
    demoState.profiles.push(blank)
    return blank
  }
  const { data, error } = await supabase.from('profiles').upsert(profile).select().single()
  if (error) throw error
  return data as Profile
}

// ---------- Eventos ----------
export async function listEvents(): Promise<EventItem[]> {
  if (isDemoMode) return [...demoState.events].sort((a, b) => a.event_date < b.event_date ? 1 : -1)
  const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false })
  if (error) throw error
  return data as EventItem[]
}

export async function getEventById(id: string): Promise<EventItem | null> {
  if (isDemoMode) return demoState.events.find((e) => e.id === id) ?? null
  const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as EventItem | null
}

export async function createEvent(event: Omit<EventItem, 'id' | 'created_at'>): Promise<EventItem> {
  if (isDemoMode) {
    const newEvent: EventItem = { ...event, id: uid('e'), created_at: new Date().toISOString() }
    demoState.events.push(newEvent)
    return newEvent
  }
  const { data, error } = await supabase.from('events').insert(event).select().single()
  if (error) throw error
  return data as EventItem
}

export async function listEventMembers(eventId: string): Promise<EventMember[]> {
  if (isDemoMode) return demoState.eventMembers.filter((m) => m.event_id === eventId)
  const { data, error } = await supabase.from('event_members').select('*').eq('event_id', eventId)
  if (error) throw error
  return data as EventMember[]
}

export async function addEventMember(eventId: string, profileId: string, roleInEvent: string): Promise<EventMember> {
  if (isDemoMode) {
    const newMember: EventMember = { id: uid('m'), event_id: eventId, profile_id: profileId, role_in_event: roleInEvent, created_at: new Date().toISOString() }
    demoState.eventMembers.push(newMember)
    return newMember
  }
  const { data, error } = await supabase.from('event_members')
    .insert({ event_id: eventId, profile_id: profileId, role_in_event: roleInEvent }).select().single()
  if (error) throw error
  return data as EventMember
}

export async function listEventsForProfile(profileId: string): Promise<EventItem[]> {
  const allMembers = isDemoMode
    ? demoState.eventMembers.filter((m) => m.profile_id === profileId)
    : (await supabase.from('event_members').select('*').eq('profile_id', profileId)).data ?? []
  const eventIds = new Set(allMembers.map((m: EventMember) => m.event_id))
  const all = await listEvents()
  return all.filter((e) => eventIds.has(e.id))
}

// ---------- Mel & Elogios ----------
export async function giveHoney(fromId: string, toId: string, amount: number, reason: string): Promise<HoneyPoint> {
  if (isDemoMode) {
    const hp: HoneyPoint = { id: uid('h'), from_profile_id: fromId, to_profile_id: toId, amount, reason, created_at: new Date().toISOString() }
    demoState.honeyPoints.push(hp)
    return hp
  }
  const { data, error } = await supabase.from('honey_points')
    .insert({ from_profile_id: fromId, to_profile_id: toId, amount, reason }).select().single()
  if (error) throw error
  return data as HoneyPoint
}

export async function giveCompliment(fromId: string, toId: string, message: string): Promise<Compliment> {
  if (isDemoMode) {
    const c: Compliment = { id: uid('c'), from_profile_id: fromId, to_profile_id: toId, message, created_at: new Date().toISOString() }
    demoState.compliments.push(c)
    return c
  }
  const { data, error } = await supabase.from('compliments')
    .insert({ from_profile_id: fromId, to_profile_id: toId, message }).select().single()
  if (error) throw error
  return data as Compliment
}

export async function listComplimentsForProfile(profileId: string): Promise<Compliment[]> {
  if (isDemoMode) return demoState.compliments.filter((c) => c.to_profile_id === profileId)
  const { data, error } = await supabase.from('compliments').select('*').eq('to_profile_id', profileId).order('created_at', { ascending: false })
  if (error) throw error
  return data as Compliment[]
}

export async function listBadgesForProfile(profileId: string): Promise<Badge[]> {
  if (isDemoMode) return demoState.badges.filter((b) => b.profile_id === profileId)
  const { data, error } = await supabase.from('badges').select('*').eq('profile_id', profileId)
  if (error) throw error
  return data as Badge[]
}

// ---------- Estatísticas agregadas ----------
export async function getProfileStats(profileId: string): Promise<ProfileStats> {
  const events = await listEventsForProfile(profileId)
  const honeyList = isDemoMode
    ? demoState.honeyPoints.filter((h) => h.to_profile_id === profileId)
    : ((await supabase.from('honey_points').select('*').eq('to_profile_id', profileId)).data ?? [])
  const compliments = await listComplimentsForProfile(profileId)
  const manualBadges = await listBadgesForProfile(profileId)

  const honeyReceived = honeyList.reduce((sum: number, h: HoneyPoint) => sum + (h.amount ?? 0), 0)
  const eventsCount = events.length
  const hiveLevel = getHiveLevel(eventsCount).level
  const autoBadges = badgesFromStats(eventsCount, compliments.length)
  const allBadgeTypes = Array.from(new Set([...autoBadges, ...manualBadges.map((b) => b.badge_type)]))

  return {
    eventsCount,
    honeyReceived,
    complimentsReceived: compliments.length,
    hiveLevel,
    badges: allBadgeTypes
  }
}

export interface RankingEntry {
  profile: Profile
  honeyReceived: number
  complimentsReceived: number
  eventsCount: number
  score: number
}

export async function getRanking(): Promise<RankingEntry[]> {
  const profiles = await listProfiles()
  const entries: RankingEntry[] = []
  for (const profile of profiles) {
    const stats = await getProfileStats(profile.id)
    entries.push({
      profile,
      honeyReceived: stats.honeyReceived,
      complimentsReceived: stats.complimentsReceived,
      eventsCount: stats.eventsCount,
      score: stats.honeyReceived + stats.complimentsReceived * 2
    })
  }
  return entries.sort((a, b) => b.score - a.score)
}
