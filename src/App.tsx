import React, { useState, useEffect, useRef } from "react";
import { Menu, User, Clock, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Phone, Mail, Leaf, MessageCircle, Send, LogOut, Sun, Moon, Plus, Trash2, Eye, Check, Sparkles } from "lucide-react";
import { format, addDays, startOfToday, parseISO, isSameDay, setHours, setMinutes, isBefore, isAfter } from "date-fns";
import { es } from "date-fns/locale";
import { toast, Toaster } from "sonner";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const intensityOptions = [
  { value: "baja", label: "Baja", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { value: "media", label: "Media", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { value: "alta", label: "Alta", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
];

const getIntensityInfo = (intensity?: string) =>
  intensityOptions.find(o => o.value === intensity) || { value: "", label: "—", className: "bg-white/5 text-[#7A7D7B] border-white/10" };

const getStatusInfo = (status?: string) => {
  switch (status) {
    case "attending": return { label: "Asistirá", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    case "rescheduled": return { label: "Reagendada", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
    case "pending": return { label: "Pendiente", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "cancelled": return { label: "Cancelada", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
    default: return { label: "Confirmada", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  }
};

interface Appointment {
  id?: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  startTime: string;
  endTime?: string;
  status?: string;
  massageType?: string;
}

interface AppConfig {
  bannerUrl: string;
  morningHours: string[];
  afternoonHours: string[];
  address: string;
  logoUrl: string;
  logoPosition: { x: number; y: number };
  massageTypes: { id: string; name: string; price: string; duration: string; description: string; intensity?: string }[];
}

export default function App() {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [hasCreds, setHasCreds] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    bannerUrl: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80",
    morningHours: [],
    afternoonHours: [],
    massageTypes: [],
    address: "",
    logoUrl: "",
    logoPosition: { x: 50, y: 50 }
  });
  
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [bookingSlot, setBookingSlot] = useState<Date | null>(null);
  const [showMassageError, setShowMassageError] = useState(false);
  const [viewingAppt, setViewingAppt] = useState<Appointment | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [showServices, setShowServices] = useState(false);
  const [activeShift, setActiveShift] = useState<"morning" | "afternoon">("morning");
  const [formData, setFormData] = useState({ clientName: "", clientEmail: "", clientPhone: "", massageType: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adminRescheduleSlot, setAdminRescheduleSlot] = useState<Date | null>(null);
  const [rescheduleApptId, setRescheduleApptId] = useState<string | null>(null);
  const [newMorningHour, setNewMorningHour] = useState("");
  const [newAfternoonHour, setNewAfternoonHour] = useState("");
  const [newMassage, setNewMassage] = useState({
    name: "",
    price: "",
    duration: "",
    description: "",
    intensity: "",
  });
  const [infoModalMassage, setInfoModalMassage] = useState<{ name: string; description: string } | null>(null);
  const [editMassageId, setEditMassageId] = useState<string | null>(null);
  const [showServiciosEditModal, setShowServiciosEditModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAppointment, setEmailAppointment] = useState<Appointment | null>(null);
  const [emailTemplate, setEmailTemplate] = useState("reminder");
  const [emailCustomText, setEmailCustomText] = useState("");
  const [showEmailCustomInput, setShowEmailCustomInput] = useState(false);
  
  // Parallax Effect
  const heroRef = useRef(null);
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 500], [0, 200]);

  // Bot State
  const [showBot, setShowBot] = useState(false);
  const [botStep, setBotStep] = useState<"greeting"|"ask_email"|"ask_verification"|"show_appointments"|"reschedule">("greeting");
  const [botData, setBotData] = useState({ email: "", verification: "", appts: [] as Appointment[], selectedApptId: "" });
  const [botRescheduleSlot, setBotRescheduleSlot] = useState<Date|null>(null);

  useEffect(() => {
    const now = new Date();
    if (now.getHours() >= 14) setActiveShift("afternoon");
    
    fetch("/api/config")
      .then(r => r.json())
      .then(d => {
        setHasCreds(d.hasCredentials);
        if (window.location.search.includes("admin=true") || localStorage.getItem("isAdmin") === "true") {
           setIsAdminAuth(true);
           localStorage.setItem("isAdmin", "true");
           if (window.location.search.includes("admin=true")) {
             window.history.replaceState({}, document.title, "/");
             toast.success("Modo Administrador Activo");
           }
        }

        // Handle Manage Token
        const params = new URLSearchParams(window.location.search);
        const manageId = params.get("manage");
        if (manageId) {
            // Find the appointment and show bot management
            fetchAppointments().then(appts => {
                const appt = (appts as any[]).find(a => a.id === manageId);
                if (appt) {
                    setBotData(prev => ({...prev, email: appt.clientEmail, appts: [appt]}));
                    setBotStep("show_appointments");
                    setShowBot(true);
                    window.history.replaceState({}, document.title, "/");
                }
            });
        }
      });
      
    fetchConfig();
    fetchAppointments();
  }, []);

  const fetchConfig = async () => {
    const r = await fetch("/api/app-config");
    const d = await r.json();
    setConfig(d);
  };

  const fetchAppointments = async () => {
    const res = await fetch("/api/appointments");
    const data = await res.json();
    setAppointments(data);
    return data;
  };

  const handleUpdateConfig = async (newConfig: AppConfig) => {
    try {
      await fetch("/api/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig)
      });
      setConfig(newConfig);
      toast.success("Configuración actualizada");
    } catch (e) {
      toast.error("Error al actualizar");
    }
  };

  const handleAddHour = async (shift: "morning" | "afternoon") => {
    const value = shift === "morning" ? newMorningHour : newAfternoonHour;
    if (!value) return;

    const current =
      shift === "morning" ? config.morningHours : config.afternoonHours;

    if (current.includes(value)) {
      toast.error("Ese horario ya existe");
      return;
    }

    const updated = [...current, value].sort();

    await handleUpdateConfig(
      shift === "morning"
        ? { ...config, morningHours: updated }
        : { ...config, afternoonHours: updated }
    );

    if (shift === "morning") setNewMorningHour("");
    else setNewAfternoonHour("");
  };

  const handleAddMassageType = async () => {
    if (!newMassage.name.trim()) {
      toast.error("Introduce el nombre del masaje");
      return;
    }

    let updatedTypes;
    if (editMassageId) {
      updatedTypes = config.massageTypes.map((m) =>
        m.id === editMassageId
          ? { ...m, name: newMassage.name.trim(), price: newMassage.price.trim(), duration: newMassage.duration.trim(), description: newMassage.description.trim(), intensity: newMassage.intensity }
          : m
      );
    } else {
      updatedTypes = [
        ...config.massageTypes,
        {
          id: Date.now().toString(),
          name: newMassage.name.trim(),
          price: newMassage.price.trim(),
          duration: newMassage.duration.trim(),
          description: newMassage.description.trim(),
          intensity: newMassage.intensity,
        },
      ];
    }

    await handleUpdateConfig({ ...config, massageTypes: updatedTypes });
    setEditMassageId(null);
    setNewMassage({ name: "", price: "", duration: "", description: "", intensity: "" });
  };

  const handleBotVerify = async (val: string) => {
    if (!val) return;
    const res = await fetch("/api/bot/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: botData.email, verification: val })
    });
    if (res.ok) {
        const data = await res.json();
        setBotData({...botData, verification: val, appts: data});
        setBotStep("show_appointments");
    } else {
        toast.error("No se encontraron citas. Verifica tus datos.");
    }
  };

  const handleAdminDelete = async (appt: Appointment) => {
    if (confirm(`¿Eliminar la cita de ${appt.clientName}?`)) {
      await fetch(`/api/appointments/${appt.id}`, { method: "DELETE" });
      toast.success("Cita eliminada");
      fetchAppointments();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("isAdmin");
    setIsAdminAuth(false);
    setShowAdminPanel(false);
    toast.success("Sesión cerrada");
  };

  const getAvailableSlots = (shift: "morning" | "afternoon") => {
    const hours = shift === "morning" ? config.morningHours : config.afternoonHours;
    const now = new Date();
    
    return hours.map(h => {
      const [hh, mm] = h.split(":").map(Number);
      const slotTime = setMinutes(setHours(selectedDate, hh), mm);
      const existing = appointments.find(a => isSameDay(parseISO(a.startTime), slotTime) && parseISO(a.startTime).getHours() === hh && parseISO(a.startTime).getMinutes() === mm);
      const isPast = isBefore(slotTime, now);
      
      return {
        time: slotTime,
        isAvailable: !existing && !isPast,
        isPast,
        appointment: existing
      };
    }).sort((a,b) => a.time.getTime() - b.time.getTime());
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlot) return;
    
    if (!formData.massageType) {
      setShowMassageError(true);
      setTimeout(() => setShowMassageError(false), 3000);
      return;
    }
    
    setIsSubmitting(true);
    try {
      const selectedMassage = config.massageTypes.find(m => m.name === formData.massageType);
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          startTime: bookingSlot.toISOString(),
          endTime: new Date(bookingSlot.getTime() + 60*60*1000).toISOString(),
          price: selectedMassage?.price || "",
          duration: selectedMassage?.duration || ""
        })
      });
      if (!res.ok) throw new Error();
      toast.success("¡Cita reservada con éxito!");
      setBookingSlot(null);
      setFormData({ clientName: "", clientEmail: "", clientPhone: "", massageType: "" });
      fetchAppointments();
    } catch(err) {
      toast.error("Error al reservar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminCancel = async (appt: Appointment) => {
    const reason = prompt("Motivo de la cancelación (opcional):");
    if (reason === null) return;
    if (confirm(`¿Cancelar cita de ${appt.clientName}?`)) {
      await fetch(`/api/appointments/${appt.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined })
      });
      toast.success("Cita cancelada");
      setViewingAppt(null);
      fetchAppointments();
    }
  };

  const handleResendEmail = async (appt: Appointment) => {
    try {
      const res = await fetch(`/api/appointments/${appt.id}/resend-email`, { method: "POST" });
      if (res.ok) {
        toast.success("Correo reenviado correctamente");
      } else {
        const err = await res.json();
        toast.error(err.error || "Error al reenviar correo");
      }
    } catch {
      toast.error("Error de conexión al reenviar correo");
    }
  };

  const handleSendCustomEmail = async () => {
    if (!emailAppointment) return;
    try {
      const res = await fetch(`/api/appointments/${emailAppointment.id}/send-custom-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: emailTemplate, customText: emailCustomText })
      });
      if (res.ok) {
        toast.success("Correo enviado correctamente");
        setShowEmailModal(false);
        setEmailAppointment(null);
        setEmailTemplate("reminder");
        setEmailCustomText("");
        setShowEmailCustomInput(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Error al enviar correo");
      }
    } catch {
      toast.error("Error de conexión");
    }
  };

  const handleAddToCalendar = async (appt: Appointment) => {
    try {
      const res = await fetch(`/api/appointments/${appt.id}/add-to-calendar`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || "Añadido al calendario correctamente");
      } else {
        toast.error(data.error || "Error al añadir al calendario");
      }
    } catch {
      toast.error("Error de conexión al añadir al calendario");
    }
  };

  const handleAdminReschedule = async (newSlot: Date) => {
    if (!rescheduleApptId) return;
    await fetch(`/api/appointments/${rescheduleApptId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startTime: newSlot.toISOString(),
        endTime: new Date(newSlot.getTime() + 60*60*1000).toISOString()
      })
    });
    toast.success("Cita reprogramada");
    setViewingAppt(null);
    setAdminRescheduleSlot(null);
    setRescheduleApptId(null);
    fetchAppointments();
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.95 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 25 } }
  };

  const renderSlot = (slot: any) => {
    const isReserved = !slot.isAvailable && !slot.isPast;
    return (
      <motion.button
        key={slot.time.toISOString()}
        variants={itemVariants}
        whileHover={slot.isAvailable ? { scale: 1.02, y: -2 } : {}}
        whileTap={slot.isAvailable ? { scale: 0.98 } : {}}
        onClick={() => {
          if (adminRescheduleSlot && slot.isAvailable) {
            handleAdminReschedule(slot.time);
          } else if (botStep === "reschedule" && slot.isAvailable) setBotRescheduleSlot(slot.time);
          else if (isAdminAuth && slot.appointment) setViewingAppt(slot.appointment);
          else if (slot.isAvailable) setBookingSlot(slot.time);
        }}
        disabled={(!slot.isAvailable && !isAdminAuth) || slot.isPast}
        className={cn(
          "relative flex flex-col items-center justify-center p-3 rounded-xl transition-all duration-300 border overflow-hidden",
          slot.isAvailable ? "bg-spa-elevated border-spa-accent/20 hover:border-spa-gold hover:shadow-[0_0_15px_rgba(201,169,110,0.1)] text-spa-crema cursor-pointer" : "cursor-not-allowed",
          isReserved && "bg-spa-card border-transparent diagonal-stripes",
          slot.isPast && "opacity-20 grayscale border-transparent"
        )}
      >
        <div className="flex flex-col items-center z-10">
          <span className={cn("text-lg font-serif mb-0.5", (slot.isAvailable || (isAdminAuth && slot.appointment)) ? "text-spa-crema" : "text-[#7A7D7B]")}>
            {format(slot.time, "HH:mm")}
          </span>
          {isAdminAuth && slot.appointment ? (
            <span className="text-[8px] font-bold text-spa-gold uppercase tracking-[0.1em]">{slot.appointment.clientName.split(" ")[0]}</span>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-[8px] font-bold uppercase tracking-widest text-[#7A7D7B]">
                {slot.isPast ? "Pasado" : (slot.isAvailable ? "Libre" : "Ocupado")}
              </span>
            </div>
          )}
        </div>
        {slot.isAvailable && <div className="absolute inset-0 bg-gradient-to-br from-spa-gold/5 to-transparent pointer-events-none" />}
      </motion.button>
    );
  };

  const upcomingDays = Array.from({ length: 14 }).map((_, i) => addDays(startOfToday(), i));

  return (
    <div className="fixed inset-0 bg-spa-base flex flex-col items-center sm:p-6 font-sans text-spa-crema overflow-hidden">
      <div className="noise-overlay" />
      <Toaster position="top-center" richColors theme="dark" />
      
      <div className="w-full max-w-4xl h-full sm:h-[850px] bg-spa-base sm:rounded-[40px] shadow-2xl flex flex-col relative border border-white/5 overflow-hidden transition-all duration-500">
        
        {/* Hero Section */}
        <div ref={heroRef} className="relative h-48 w-full shrink-0 overflow-hidden">
          <motion.img 
            style={{ y: heroY }}
            src={config.bannerUrl} 
            className="w-full h-full object-cover opacity-40 scale-105 object-[50%_30%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-spa-base via-spa-base/20 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-spa-gold/10 via-spa-accent/5 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(201,169,110,0.15),transparent_70%)]" />
          <div className="absolute top-0 left-0 right-0 p-8 flex justify-between items-start z-20">
            <div className="flex flex-col">
              <h1 className="text-3xl md:text-4xl font-serif text-spa-crema tracking-tight">Jean Pierre</h1>
              <div className="h-0.5 w-10 bg-spa-gold mt-2 mb-1.5" />
              <p className="text-[8px] font-bold text-spa-gold uppercase tracking-[0.4em]">Massage Studio</p>
            </div>
            {config.logoUrl && (
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden border-2 border-spa-gold/30 shrink-0 bg-spa-elevated">
                <img
                  src={config.logoUrl}
                  alt="Logo"
                  className="w-full h-full object-cover"
                  style={{ objectPosition: `${config.logoPosition.x}% ${config.logoPosition.y}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Date Picker */}
        <div className="-mt-12 z-30 relative">
          <div className="flex gap-3 overflow-x-auto no-scrollbar py-8 px-6 sm:px-8">
            {upcomingDays.map((day) => {
              const active = isSameDay(day, selectedDate);
              const past = isBefore(day, startOfToday());
              const freeCount = [...getAvailableSlots("morning"), ...getAvailableSlots("afternoon")].filter(s => isSameDay(s.time, day) && s.isAvailable).length;
              
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  disabled={past}
                  className={cn(
                    "flex flex-col items-center justify-center min-w-[55px] h-[80px] rounded-[16px] transition-all duration-500 border group relative",
                    active ? "bg-gradient-to-b from-spa-accent to-[#6B5340] border-spa-gold text-spa-crema shadow-2xl scale-105" : "bg-spa-card border-white/5 text-[#7A7D7B] hover:border-white/20"
                  )}
                >
                  <span className="text-[7px] font-bold uppercase tracking-widest mb-1 opacity-60">{format(day, "eee", { locale: es })}</span>
                  <span className="text-xl font-serif font-medium">{format(day, "d")}</span>
                  {active && <motion.div layoutId="date-dot" className="w-0.5 h-0.5 bg-spa-gold rounded-full mt-1 shadow-[0_0_10px_#C9A96E]" />}
                  {freeCount > 0 && !active && (
                    <span className="absolute -top-1 -right-1 bg-spa-gold text-spa-base text-[7px] font-bold px-1 py-0.5 rounded-full">{freeCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-6 sm:px-8 pb-32">
          {/* Shift Selector */}
          <div className="flex p-1 bg-spa-card border border-white/5 rounded-[20px] mb-8 relative max-w-sm mx-auto glow-gold">
            <motion.div
              className="absolute inset-y-1 rounded-[16px] bg-spa-accent shadow-2xl z-0"
              initial={false}
              animate={{ x: activeShift === "morning" ? 0 : "100%", width: "calc(50% - 4px)" }}
              style={{ left: 4 }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />
            <button onClick={() => setActiveShift("morning")} className={cn("flex-1 py-3 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest z-10 transition-all", activeShift === "morning" ? "text-spa-crema" : "text-[#7A7D7B]")}>
              <Sun size={12} /> Mañana
            </button>
            <button onClick={() => setActiveShift("afternoon")} className={cn("flex-1 py-3 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest z-10 transition-all", activeShift === "afternoon" ? "text-spa-crema" : "text-[#7A7D7B]")}>
              <Moon size={12} /> Tarde
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
            <section className={cn("flex flex-col space-y-8", activeShift !== "morning" && "hidden md:flex")}>
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-spa-accent/30" />
                <h2 className="text-[11px] font-bold text-spa-gold uppercase tracking-[0.35em]">Sesiones Mañana</h2>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-spa-accent/30" />
              </div>
              <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                key={`morning-${selectedDate.toISOString()}`}
                className="grid grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {getAvailableSlots("morning").map(renderSlot)}
              </motion.div>
            </section>

            <section className={cn("flex flex-col space-y-8", activeShift !== "afternoon" && "hidden md:flex")}>
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-spa-accent/30" />
                <h2 className="text-[11px] font-bold text-spa-gold uppercase tracking-[0.35em]">Sesiones Tarde</h2>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-spa-accent/30" />
              </div>
              <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                key={`afternoon-${selectedDate.toISOString()}`}
                className="grid grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {getAvailableSlots("afternoon").map(renderSlot)}
              </motion.div>
            </section>
          </div>
        </div>

        {/* Footer Bar - Pill Version */}
        <div className="absolute bottom-6 inset-x-8 h-16 bg-spa-card/80 backdrop-blur-2xl border border-white/10 rounded-full flex items-center justify-between px-4 z-40 shadow-2xl">
           <div className="flex-1 flex justify-start">
              <button 
                onClick={() => setShowSideMenu(true)} 
                className="w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-spa-gold hover:bg-spa-gold hover:text-spa-base transition-all"
              >
                <Menu size={18} />
              </button>
           </div>
           <div className="flex flex-col items-center">
             <span className="text-sm font-serif text-spa-crema tracking-tight">JP Masajes</span>
             <span className="text-[7px] text-spa-gold font-bold uppercase tracking-[0.2em] -mt-0.5">Equilibrio & Bienestar</span>
           </div>
           <div className="flex-1 flex justify-end">
              <button 
                onClick={()=>setShowBot(true)}
                className="relative w-10 h-10 bg-spa-gold rounded-full shadow-lg flex items-center justify-center text-spa-base hover:scale-105 active:scale-95 transition-all pulse-ring"
              >
                  <MessageCircle size={18} />
              </button>
           </div>
        </div>

        {/* Modals & Overlays */}
        <AnimatePresence>
          {bookingSlot && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] bg-spa-base/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
               <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="w-full max-w-md bg-spa-card rounded-[24px] sm:rounded-[32px] border border-white/10 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                  <div className="p-6 sm:p-8 overflow-y-auto no-scrollbar flex-1 min-h-0">
                   <div className="flex justify-between items-center mb-5 sm:mb-6">
                       <h2 className="text-2xl sm:text-3xl font-serif">Reserva</h2>
                       <button onClick={() => setBookingSlot(null)} className="p-1.5 sm:p-2 bg-spa-elevated rounded-full hover:text-spa-gold transition-colors"><X size={18}/></button>
                   </div>
                   
<div className="bg-gradient-to-r from-spa-accent/20 to-transparent p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-spa-gold/20 mb-6 sm:mb-8 flex items-center gap-3 sm:gap-4">
                       <div className="w-10 h-10 sm:w-12 sm:h-12 bg-spa-gold rounded-lg sm:rounded-xl flex items-center justify-center text-spa-base shadow-xl shrink-0"><CalendarIcon size={18}/></div>
                       <div>
                         <p className="text-[8px] font-bold text-spa-gold uppercase tracking-[0.1em] mb-0.5">{format(bookingSlot, "EEEE d MMMM", { locale: es })}</p>
                         <p className="text-lg sm:text-xl font-serif">{format(bookingSlot, "HH:mm")} • 60 min</p>
                       </div>
                    </div>

                    {showMassageError && (
                      <div className="bg-rose-500/20 border border-rose-500/40 rounded-xl p-4 flex items-center gap-3 mb-4">
                        <span className="text-rose-500 text-sm font-bold">Tienes que seleccionar un tipo de masaje</span>
                      </div>
                    )}

                    <form onSubmit={handleBook} className="space-y-4 sm:space-y-5">
                      <div className="space-y-2">
                         <label className="text-[9px] font-bold text-spa-gold uppercase tracking-widest px-1">Selecciona Masaje</label>
                          <div className="grid grid-cols-1 gap-2">
                            {config.massageTypes.map(m => {
                              const isSelected = formData.massageType === m.name;
                              return (
                                <div key={m.id}>
                                  <button 
                                   type="button"
                                   onClick={() => setFormData({...formData, massageType: isSelected ? "" : m.name})}
                                   className={cn(
                                     "w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all",
                                     isSelected ? "bg-spa-accent/20 border-spa-gold rounded-b-none" : "bg-spa-elevated border-white/5"
                                   )}
                                  >
                                    <div>
                                      <p className="text-xs font-bold flex items-center gap-2"><Leaf size={12} className="text-spa-gold shrink-0" />{m.name}
                                        {m.intensity && (
                                          <span className={`px-1.5 py-0.5 rounded-md text-[6px] font-bold uppercase tracking-wider border ${getIntensityInfo(m.intensity).className}`}>
                                            {getIntensityInfo(m.intensity).label}
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-[9px] opacity-60">{m.duration}</p>
                                    </div>
                                    <span className="text-xs font-bold text-spa-gold">{m.price}</span>
                                  </button>
                                  {isSelected && m.description && (
                                    <div className="bg-spa-accent/10 border border-t-0 border-spa-gold rounded-b-xl px-3 py-2.5 text-[10px] text-spa-crema/70 leading-relaxed">
                                      {m.description}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                      </div>
                      <div className="floating-label-group">
                        <input required className="w-full h-12 sm:h-14 bg-spa-elevated rounded-lg sm:rounded-xl px-4 sm:px-5 outline-none border border-white/5 focus:border-spa-gold transition-all text-sm" placeholder=" " value={formData.clientName} onChange={e => setFormData({...formData, clientName: e.target.value})}/>
                        <label className="absolute left-4 sm:left-5 top-3.5 sm:top-4 text-[#7A7D7B] pointer-events-none transition-all text-xs sm:text-sm">Nombre Completo</label>
                      </div>
                      <div className="floating-label-group">
                        <input required type="email" className="w-full h-12 sm:h-14 bg-spa-elevated rounded-lg sm:rounded-xl px-4 sm:px-5 outline-none border border-white/5 focus:border-spa-gold transition-all text-sm" placeholder=" " value={formData.clientEmail} onChange={e => setFormData({...formData, clientEmail: e.target.value})}/>
                        <label className="absolute left-4 sm:left-5 top-3.5 sm:top-4 text-[#7A7D7B] pointer-events-none transition-all text-xs sm:text-sm">Correo Electrónico</label>
                      </div>
                      <div className="floating-label-group">
                        <input type="tel" className="w-full h-12 sm:h-14 bg-spa-elevated rounded-lg sm:rounded-xl px-4 sm:px-5 outline-none border border-white/5 focus:border-spa-gold transition-all text-sm" placeholder=" " value={formData.clientPhone} onChange={e => setFormData({...formData, clientPhone: e.target.value})}/>
                        <label className="absolute left-4 sm:left-5 top-3.5 sm:top-4 text-[#7A7D7B] pointer-events-none transition-all text-xs sm:text-sm">Teléfono (Opcional)</label>
                      </div>
                      <button disabled={isSubmitting} className="w-full h-12 sm:h-14 bg-spa-gold text-spa-base font-bold uppercase tracking-[0.2em] rounded-lg sm:rounded-xl mt-2 hover:opacity-90 active:scale-95 transition-all shadow-xl text-xs sm:text-sm">
                        {isSubmitting ? "Procesando..." : "Confirmar Cita"}
                      </button>
                   </form>
                 </div>
               </motion.div>
             </motion.div>
           )}

           {/* Appointment Detail Modal (Admin) */}
           {viewingAppt && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] bg-spa-base/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} transition={{ type: "spring", damping: 30, stiffness: 300 }} className="w-full max-w-md bg-spa-card rounded-[24px] sm:rounded-[32px] border border-white/10 shadow-2xl overflow-hidden">
                  <div className="p-6 sm:p-8">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl sm:text-3xl font-serif">Detalle de Cita</h2>
                      <button onClick={() => setViewingAppt(null)} className="p-1.5 sm:p-2 bg-spa-elevated rounded-full hover:text-spa-gold transition-colors"><X size={18}/></button>
                    </div>
                    <div className="space-y-4">
                      <div className="bg-gradient-to-r from-spa-accent/20 to-transparent p-4 rounded-xl border border-spa-gold/20">
                        <p className="text-lg font-serif text-spa-crema">{viewingAppt.clientName}</p>
                        <p className="text-[10px] text-spa-gold font-medium mt-1">{viewingAppt.clientEmail} {viewingAppt.clientPhone ? `• ${viewingAppt.clientPhone}` : ''}</p>
                      </div>
                      <div className="bg-spa-elevated p-4 rounded-xl border border-white/5 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-[9px] font-bold text-spa-gold uppercase tracking-widest">Fecha</span>
                          <span className="text-sm">{format(parseISO(viewingAppt.startTime), "EEEE d 'de' MMMM", { locale: es })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[9px] font-bold text-spa-gold uppercase tracking-widest">Hora</span>
                          <span className="text-sm">{format(parseISO(viewingAppt.startTime), "HH:mm")}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-spa-gold uppercase tracking-widest">Servicio</span>
                          <span className="text-sm flex items-center gap-2">{viewingAppt.massageType || 'No especificado'}
                            {(() => {
                              const mt = config.massageTypes.find(t => t.name === viewingAppt.massageType);
                              if (mt?.intensity) {
                                const info = getIntensityInfo(mt.intensity);
                                return <span className={`px-2 py-0.5 rounded-md text-[7px] font-bold uppercase tracking-wider border ${info.className}`}>{info.label}</span>;
                              }
                              return null;
                            })()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[9px] font-bold text-spa-gold uppercase tracking-widest">Duración</span>
                          <span className="text-sm">{viewingAppt.duration || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[9px] font-bold text-spa-gold uppercase tracking-widest">Precio</span>
                          <span className="text-sm font-bold text-spa-gold">{viewingAppt.price || '—'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-bold text-spa-gold uppercase tracking-widest">Estado</span>
                          <span className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider border ${getStatusInfo(viewingAppt.status).className}`}>{getStatusInfo(viewingAppt.status).label}</span>
                        </div>
                      </div>
                      {isBefore(parseISO(viewingAppt.startTime), new Date()) ? (
                        <div className="bg-spa-elevated p-4 rounded-xl border border-white/5 text-center">
                          <p className="text-[10px] text-[#7A7D7B] uppercase tracking-widest">Cita pasada — No disponible</p>
                        </div>
                      ) : (
                        <div className="flex gap-3 pt-2">
                          <button onClick={() => { setAdminRescheduleSlot(new Date()); setRescheduleApptId(viewingAppt!.id!); setViewingAppt(null); toast.info("Selecciona un horario disponible en el calendario"); }} className="flex-1 py-4 bg-spa-accent/10 border border-spa-accent/30 rounded-xl text-[9px] font-bold uppercase tracking-widest text-spa-gold hover:bg-spa-accent hover:text-spa-base transition-all">Reagendar</button>
                          <button onClick={() => { setEmailAppointment(viewingAppt); setShowEmailModal(true); }} className="flex-1 py-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-[9px] font-bold uppercase tracking-widest text-blue-400 hover:bg-blue-500 hover:text-white transition-all"><Mail size={14} className="inline mr-1" />Correo</button>
                          <button onClick={() => { handleAddToCalendar(viewingAppt); }} className="flex-1 py-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[9px] font-bold uppercase tracking-widest text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"><CalendarIcon size={14} className="inline mr-1" />Calendario</button>
                          <button onClick={() => handleAdminCancel(viewingAppt)} className="flex-1 py-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-[9px] font-bold uppercase tracking-widest text-rose-500 hover:bg-rose-500 hover:text-white transition-all">Cancelar</button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
             </motion.div>
           )}

           {/* Reschedule mode banner */}
           {adminRescheduleSlot && !viewingAppt && (
             <div className="absolute bottom-28 inset-x-8 z-50 bg-spa-accent/20 backdrop-blur-xl border border-spa-gold/30 rounded-2xl p-4 flex items-center justify-between shadow-2xl">
               <p className="text-[10px] font-bold text-spa-gold uppercase tracking-widest">Modo Reagendar — Haz clic en un horario disponible</p>
               <button onClick={() => { setAdminRescheduleSlot(null); setRescheduleApptId(null); }} className="p-2 bg-spa-elevated rounded-full hover:text-spa-crema transition-colors"><X size={16}/></button>
             </div>
           )}

           {/* Admin Panel */}
          {showAdminPanel && isAdminAuth && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-spa-base/90 backdrop-blur-xl flex items-center justify-center p-6"
            >
              <div className="w-full max-w-2xl bg-spa-card rounded-[40px] border border-white/10 shadow-2xl h-[80vh] flex flex-col">
                <div className="p-6 sm:p-10 border-b border-white/5 flex justify-between items-center">
                  <h2 className="text-3xl font-serif">Administración</h2>
                  <button
                    onClick={() => setShowAdminPanel(false)}
                    className="p-3 bg-spa-elevated rounded-full hover:text-spa-gold"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-12 no-scrollbar">
                  {/* Gestión de Horarios */}
                  <div className="space-y-8">
                    <h3 className="text-[11px] font-bold text-spa-gold uppercase tracking-[0.4em]">
                      Gestión de Horarios
                    </h3>

                    {/* Morning */}
                    <div className="space-y-4">
                      <p className="text-[10px] text-[#7A7D7B] font-bold uppercase">Mañana</p>
                      <div className="flex flex-wrap gap-2">
                        {config.morningHours.map((h) => (
                          <div
                            key={h}
                            className="bg-spa-elevated px-4 py-2 rounded-xl flex items-center gap-3 border border-white/5 group hover:border-rose-500/50 transition-colors"
                          >
                            <span className="text-sm font-medium">{h}</span>
                            <button
                              onClick={() =>
                                handleUpdateConfig({
                                  ...config,
                                  morningHours: config.morningHours.filter((x) => x !== h),
                                })
                              }
                              className="text-[#7A7D7B] hover:text-rose-500"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-3">
                        <input
                          type="time"
                          value={newMorningHour}
                          onChange={(e) => setNewMorningHour(e.target.value)}
                          className="flex-1 h-11 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm"
                        />
                        <button
                          onClick={() => handleAddHour("morning")}
                          className="bg-spa-accent/10 px-4 py-2 rounded-xl border border-spa-accent/30 text-spa-gold flex items-center gap-2 hover:bg-spa-accent/20 transition-all"
                        >
                          <Plus size={14} />
                          <span className="text-[10px] font-bold uppercase">Añadir</span>
                        </button>
                      </div>
                    </div>

                    {/* Afternoon */}
                    <div className="space-y-4">
                      <p className="text-[10px] text-[#7A7D7B] font-bold uppercase">Tarde</p>
                      <div className="flex flex-wrap gap-2">
                        {config.afternoonHours.map((h) => (
                          <div
                            key={h}
                            className="bg-spa-elevated px-4 py-2 rounded-xl flex items-center gap-3 border border-white/5 group hover:border-rose-500/50 transition-colors"
                          >
                            <span className="text-sm font-medium">{h}</span>
                            <button
                              onClick={() =>
                                handleUpdateConfig({
                                  ...config,
                                  afternoonHours: config.afternoonHours.filter((x) => x !== h),
                                })
                              }
                              className="text-[#7A7D7B] hover:text-rose-500"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-3">
                        <input
                          type="time"
                          value={newAfternoonHour}
                          onChange={(e) => setNewAfternoonHour(e.target.value)}
                          className="flex-1 h-11 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm"
                        />
                        <button
                          onClick={() => handleAddHour("afternoon")}
                          className="bg-spa-accent/10 px-4 py-2 rounded-xl border border-spa-accent/30 text-spa-gold flex items-center gap-2 hover:bg-spa-accent/20 transition-all"
                        >
                          <Plus size={14} />
                          <span className="text-[10px] font-bold uppercase">Añadir</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Estudio */}
                  <div className="space-y-6">
                    <h3 className="text-[11px] font-bold text-spa-gold uppercase tracking-[0.4em]">
                      Estudio
                    </h3>

                    <div className="relative h-36 rounded-2xl overflow-hidden border border-white/10">
                      <img
                        src={config.bannerUrl}
                        alt="Banner del estudio"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-spa-base/60 to-transparent" />
                    </div>

                    <label className="block w-full cursor-pointer">
                      <span className="w-full flex items-center justify-center py-4 rounded-xl bg-spa-elevated border border-white/5 text-spa-gold font-bold uppercase text-[10px] tracking-widest hover:border-spa-gold transition-all">
                        Cambiar imagen
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            const r = new FileReader();
                            r.onload = (ev) =>
                              handleUpdateConfig({
                                ...config,
                                bannerUrl: ev.target?.result as string,
                              });
                            r.readAsDataURL(f);
                          }
                        }}
                      />
                    </label>

                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-spa-gold uppercase tracking-widest px-1">Dirección del Estudio</label>
                      <div className="flex gap-2">
                        <input
                          value={config.address}
                          onChange={(e) => setConfig(prev => ({ ...prev, address: e.target.value }))}
                          placeholder="Calle, número, ciudad..."
                          className="flex-1 h-11 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm"
                        />
                          <button
                            onClick={() => handleUpdateConfig({ ...config, address: config.address })}
                            className="px-5 h-11 rounded-xl bg-spa-gold text-spa-base text-[10px] font-bold uppercase tracking-widest hover:bg-spa-accent transition-all shrink-0"
                          >
                            <Check size={14} className="inline mr-1" />OK
                          </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-spa-gold uppercase tracking-widest px-1">Logo del Estudio</label>
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-spa-gold/30 shrink-0 bg-spa-elevated flex items-center justify-center">
                          {config.logoUrl ? (
                            <img
                              src={config.logoUrl}
                              alt="Logo"
                              className="w-full h-full object-cover"
                              style={{ objectPosition: `${config.logoPosition.x}% ${config.logoPosition.y}%` }}
                            />
                          ) : (
                            <span className="text-[9px] text-[#7A7D7B] uppercase tracking-widest">Logo</span>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <label className="block w-full cursor-pointer">
                            <span className="w-full flex items-center justify-center py-3 rounded-xl bg-spa-elevated border border-white/5 text-spa-gold font-bold uppercase text-[9px] tracking-widest hover:border-spa-gold transition-all">
                              Subir logo
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) {
                                  const r = new FileReader();
                                  r.onload = (ev) =>
                                    handleUpdateConfig({
                                      ...config,
                                      logoUrl: ev.target?.result as string,
                                    });
                                  r.readAsDataURL(f);
                                }
                              }}
                            />
                          </label>
                          {config.logoUrl && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleUpdateConfig({ ...config, logoPosition: { x: Math.max(0, config.logoPosition.x - 5), y: config.logoPosition.y } })}
                                className="p-1.5 bg-spa-elevated rounded-lg hover:text-spa-gold transition-colors text-[#7A7D7B]"
                                title="Mover izquierda"
                              >←</button>
                              <button
                                onClick={() => handleUpdateConfig({ ...config, logoPosition: { x: config.logoPosition.x, y: Math.max(0, config.logoPosition.y - 5) } })}
                                className="p-1.5 bg-spa-elevated rounded-lg hover:text-spa-gold transition-colors text-[#7A7D7B]"
                                title="Mover arriba"
                              >↑</button>
                              <button
                                onClick={() => handleUpdateConfig({ ...config, logoPosition: { x: config.logoPosition.x, y: Math.min(100, config.logoPosition.y + 5) } })}
                                className="p-1.5 bg-spa-elevated rounded-lg hover:text-spa-gold transition-colors text-[#7A7D7B]"
                                title="Mover abajo"
                              >↓</button>
                              <button
                                onClick={() => handleUpdateConfig({ ...config, logoPosition: { x: Math.min(100, config.logoPosition.x + 5), y: config.logoPosition.y } })}
                                className="p-1.5 bg-spa-elevated rounded-lg hover:text-spa-gold transition-colors text-[#7A7D7B]"
                                title="Mover derecha"
                              >→</button>
                              <button
                                onClick={() => handleUpdateConfig({ ...config, logoUrl: "", logoPosition: { x: 50, y: 50 } })}
                                className="p-1.5 bg-rose-500/10 rounded-lg hover:bg-rose-500/30 text-rose-500 transition-colors ml-1"
                                title="Eliminar logo"
                              >✕</button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Próximas Citas */}
                  <div className="space-y-6">
                    <h3 className="text-[11px] font-bold text-spa-gold uppercase tracking-[0.4em]">
                      Próximas Citas
                    </h3>

                    {appointments
                      .filter((a) => isAfter(parseISO(a.startTime), new Date()))
                      .sort(
                        (a, b) =>
                          parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()
                      ).length === 0 ? (
                      <div className="bg-spa-elevated border border-white/5 rounded-2xl p-6 text-center">
                        <p className="text-sm text-[#7A7D7B]">Sin citas próximas</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {appointments
                          .filter((a) => isAfter(parseISO(a.startTime), new Date()))
                          .sort(
                            (a, b) =>
                              parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()
                          )
                          .map((appt) => (
                            <div
                              key={appt.id}
                              className="bg-spa-elevated px-4 py-4 rounded-xl border border-white/5 flex items-center justify-between gap-4"
                            >
                              <div>
                                <p className="text-sm font-medium flex items-center gap-2">{appt.clientName}
                                  <span className={`px-1.5 py-0.5 rounded-md text-[7px] font-bold uppercase tracking-wider border ${getStatusInfo(appt.status).className}`}>{getStatusInfo(appt.status).label}</span>
                                </p>
                                <p className="text-[10px] text-[#7A7D7B] mt-1">
                                  {format(parseISO(appt.startTime), "d MMM, HH:mm", {
                                    locale: es,
                                  })}
                                </p>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEmailAppointment(appt); setShowEmailModal(true); }}
                                  className="px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white transition-all"
                                  title="Enviar correo"
                                >
                                  <Mail size={12} className="inline mr-1" />Email
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleAddToCalendar(appt); }}
                                  className="px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all"
                                  title="Añadir al calendario"
                                >
                                  <CalendarIcon size={12} className="inline mr-1" />Cal
                                </button>
                                <button
                                  onClick={() => {
                                    setViewingAppt(appt);
                                    setShowAdminPanel(false);
                                  }}
                                  className="px-2 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest bg-spa-accent/10 text-spa-gold hover:bg-spa-accent hover:text-spa-base transition-all"
                                >
                                  <Eye size={12} className="inline mr-1" />Ver
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Historial e Ingresos */}
                  <div className="space-y-6">
                    <h3 className="text-[11px] font-bold text-spa-gold uppercase tracking-[0.4em]">
                      Historial e Ingresos
                    </h3>

                    {(() => {
                      const allAppointments = [...appointments].sort(
                        (a, b) =>
                          parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime()
                      );

                      const getPrice = (appt: any) => {
                        if (appt.price) {
                          const num = parseFloat(appt.price.replace(/[€$,]/g, ""));
                          if (!isNaN(num)) return num;
                        }
                        const massage = config.massageTypes.find(
                          (m) => m.name === appt.massageType
                        );
                        return massage?.price ? parseFloat(massage.price.replace(/[€$,]/g, "")) : 0;
                      };

                      const totalIngresos = appointments.reduce((total, appt) => {
                        return total + getPrice(appt);
                      }, 0);

                      const totalCitas = appointments.length;
                      const citasPasadas = appointments.filter((a) => isBefore(parseISO(a.startTime), new Date())).length;
                      const citasPendientes = totalCitas - citasPasadas;

                      return (
                        <>
                          {/* Resumen de ingresos */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-spa-elevated p-4 rounded-xl border border-white/5">
                              <p className="text-[9px] text-[#7A7D7B] font-bold uppercase mb-1">
                                Ingresos Totales
                              </p>
                              <p className="text-xl font-serif text-spa-gold">
                                {totalIngresos.toFixed(2)}€
                              </p>
                            </div>
                            <div className="bg-spa-elevated p-4 rounded-xl border border-white/5">
                              <p className="text-[9px] text-[#7A7D7B] font-bold uppercase mb-1">
                                Completadas
                              </p>
                              <p className="text-xl font-serif text-spa-crema">
                                {citasPasadas}
                              </p>
                            </div>
                            <div className="bg-spa-elevated p-4 rounded-xl border border-white/5">
                              <p className="text-[9px] text-[#7A7D7B] font-bold uppercase mb-1">
                                Pendientes
                              </p>
                              <p className="text-xl font-serif text-spa-gold">
                                {citasPendientes}
                              </p>
                            </div>
                          </div>

                          {/* Historial */}
                          {allAppointments.length === 0 ? (
                            <div className="bg-spa-elevated border border-white/5 rounded-2xl p-6 text-center">
                              <p className="text-sm text-[#7A7D7B]">Sin historial aún</p>
                            </div>
                          ) : (
                            <div className="space-y-3 max-h-64 overflow-y-auto no-scrollbar">
                              {allAppointments.slice(0, 30).map((appt) => {
                                const isPast = isBefore(parseISO(appt.startTime), new Date());
                                const price = getPrice(appt);
                                return (
                                  <div
                                    key={appt.id}
                                    className="bg-spa-elevated px-4 py-3 rounded-xl border border-white/5 flex items-center justify-between gap-4 group"
                                  >
                                    <div className="flex-1">
                                      <p className="text-sm font-medium flex items-center gap-2">{appt.clientName}
                                        <span className={`px-1.5 py-0.5 rounded-md text-[7px] font-bold uppercase tracking-wider border ${getStatusInfo(appt.status).className}`}>{getStatusInfo(appt.status).label}</span>
                                      </p>
                                      <p className="text-[10px] text-[#7A7D7B] mt-0.5">
                                        {format(parseISO(appt.startTime), "d MMM yyyy", {
                                          locale: es,
                                        })}{" "}
                                        • {appt.massageType || "Sin tipo"}
                                        {(() => {
                                          const mt = config.massageTypes.find(t => t.name === appt.massageType);
                                          if (mt?.intensity) {
                                            const info = getIntensityInfo(mt.intensity);
                                            return <span className={`ml-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${info.className}`}>{info.label}</span>;
                                          }
                                          return null;
                                        })()}
                                        {appt.duration && ` • ${appt.duration}`}
                                        {isPast && <span className="ml-2 text-emerald-500">✓</span>}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => { setEmailAppointment(appt); setShowEmailModal(true); }}
                                        className="p-1.5 text-[#7A7D7B] hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                                        title="Enviar correo"
                                      >
                                        <Mail size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleAddToCalendar(appt)}
                                        className="p-1.5 text-[#7A7D7B] hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"
                                        title="Añadir al calendario"
                                      >
                                        <CalendarIcon size={14} />
                                      </button>
                                      <span className="text-sm font-bold text-spa-gold mx-1">
                                        {price > 0 ? `${price.toFixed(2)}€` : "—"}
                                      </span>
                                      <button
                                        onClick={() => handleAdminDelete(appt)}
                                        className="p-2 text-[#7A7D7B] hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                                        title="Eliminar cita"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-4 text-rose-500"
                  >
                    <LogOut size={20} />
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            </motion.div>
          )}


          {/* Servicios */}
          {showServices && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-spa-base/90 backdrop-blur-xl flex items-center justify-center p-6"
            >
              <div className="w-full max-w-2xl bg-spa-card rounded-[40px] border border-white/10 shadow-2xl max-h-[80vh] flex flex-col">
                <div className="p-6 sm:p-10 pb-6 border-b border-white/5 flex justify-between items-center">
                  <h2 className="text-3xl font-serif">Servicios</h2>
                  <button
                    onClick={() => setShowServices(false)}
                    className="p-3 bg-spa-elevated rounded-full hover:text-spa-gold"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-4 no-scrollbar">
                  {config.massageTypes.length === 0 ? (
                    <div className="bg-spa-elevated border border-white/5 rounded-2xl p-10 text-center">
                      <p className="text-sm text-[#7A7D7B]">No hay servicios disponibles</p>
                    </div>
                  ) : (
                    config.massageTypes.map((m) => (
                      <div
                        key={m.id}
                        className="bg-spa-elevated rounded-2xl border border-white/5 p-6 flex items-center justify-between gap-6 hover:border-spa-gold/40 hover:shadow-[0_0_30px_rgba(201,169,110,0.08)] hover:scale-[1.01] transition-all duration-300 group"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-serif text-spa-crema">{m.name}</h3>
                            {m.intensity && (
                              <span className={`px-2 py-0.5 rounded-md text-[7px] font-bold uppercase tracking-wider border ${getIntensityInfo(m.intensity).className}`}>
                                {getIntensityInfo(m.intensity).label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="text-sm font-bold text-spa-gold">{m.price}</span>
                            <span className="text-[10px] text-[#7A7D7B] uppercase tracking-widest">{m.duration}</span>
                          </div>
                          {m.description && (
                            <p className="text-xs text-spa-crema/70 mt-3 leading-relaxed">{m.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isAdminAuth ? (
                            <>
                              <button
                                onClick={() => {
                                  setEditMassageId(m.id);
                                  setNewMassage({ name: m.name, price: m.price, duration: m.duration, description: m.description || "", intensity: m.intensity || "" });
                                  setShowServiciosEditModal(true);
                                }}
                                className="p-2 text-[#7A7D7B] hover:text-spa-gold transition-colors"
                                title="Editar servicio"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                              </button>
                              <button
                                onClick={() =>
                                  handleUpdateConfig({
                                    ...config,
                                    massageTypes: config.massageTypes.filter((x) => x.id !== m.id),
                                  })
                                }
                                className="p-2 text-[#7A7D7B] hover:text-rose-500 transition-colors"
                                title="Eliminar servicio"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setFormData(prev => ({ ...prev, massageType: m.name }));
                                setShowServices(false);
                              }}
                              className="px-6 py-3 rounded-xl bg-spa-gold text-spa-base text-[10px] font-bold uppercase tracking-widest hover:bg-spa-accent hover:text-spa-base transition-all"
                            >
                              Reservar
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  {isAdminAuth && !editMassageId && (
                    <div className="pt-6 space-y-4">
                      <div className="grid grid-cols-1 gap-3">
                        <textarea
                          value={newMassage.description}
                          onChange={(e) => setNewMassage((prev) => ({ ...prev, description: e.target.value }))}
                          placeholder="Descripción del servicio"
                          rows={3}
                          className="h-24 bg-spa-elevated border border-white/5 rounded-xl px-4 py-3 outline-none focus:border-spa-gold text-sm resize-none"
                        />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <input
                            value={newMassage.name}
                            onChange={(e) => setNewMassage((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="Nombre"
                            className="h-11 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm"
                          />
                          <input
                            value={newMassage.price}
                            onChange={(e) => setNewMassage((prev) => ({ ...prev, price: e.target.value }))}
                            placeholder="Precio"
                            className="h-11 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm"
                          />
                          <input
                            value={newMassage.duration}
                            onChange={(e) => setNewMassage((prev) => ({ ...prev, duration: e.target.value }))}
                            placeholder="Duración"
                            className="h-11 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm"
                          />
                        </div>
                        <select
                          value={newMassage.intensity}
                          onChange={(e) => setNewMassage((prev) => ({ ...prev, intensity: e.target.value }))}
                          className="h-11 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm"
                        >
                          <option value="">Sin intensidad</option>
                          {intensityOptions.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleAddMassageType}
                          className="flex-1 py-4 border-2 border-dashed border-spa-accent/30 rounded-xl text-spa-gold text-[10px] font-bold uppercase tracking-widest hover:bg-spa-accent/10 transition-all flex items-center justify-center gap-2"
                        >
                          {editMassageId ? <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg> : <Plus size={16} />}
                          {editMassageId ? "Guardar Cambios" : "Añadir Servicio"}
                        </button>
                        {editMassageId && (
                          <button
                            onClick={() => { setEditMassageId(null); setNewMassage({ name: "", price: "", duration: "", description: "" }); }}
                            className="px-6 py-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Email Modal */}
          {showEmailModal && emailAppointment && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[200] bg-spa-base/60 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div initial={{ y: 30, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, scale: 0.95 }} transition={{ type: "spring", damping: 28, stiffness: 300 }} className="w-full max-w-md bg-spa-card rounded-[24px] border border-white/10 shadow-2xl overflow-hidden p-6">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-xl font-serif">Enviar Correo</h3>
                  <button onClick={() => { setShowEmailModal(false); setEmailAppointment(null); setEmailTemplate("reminder"); setEmailCustomText(""); setShowEmailCustomInput(false); }} className="p-1.5 bg-spa-elevated rounded-full hover:text-spa-gold transition-colors"><X size={18}/></button>
                </div>
                <div className="bg-gradient-to-r from-spa-accent/20 to-transparent p-4 rounded-xl border border-spa-gold/20 mb-5">
                  <p className="text-sm font-serif">{emailAppointment.clientName}</p>
                  <p className="text-[10px] text-spa-gold mt-1">{emailAppointment.clientEmail}</p>
                  <p className="text-[9px] text-[#7A7D7B] mt-0.5">{emailAppointment.massageType} • {format(parseISO(emailAppointment.startTime), "d MMM, HH:mm", { locale: es })}</p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <select value={emailTemplate} onChange={e => {
                      const val = e.target.value;
                      setEmailTemplate(val);
                      if (val === "custom" && emailAppointment) {
                        setEmailCustomText(`Te escribo para informarte sobre tu cita de ${emailAppointment.massageType || 'masaje'} el ${format(parseISO(emailAppointment.startTime), "EEEE d 'de' MMMM", { locale: es })} a las ${format(parseISO(emailAppointment.startTime), "HH:mm")}.${emailAppointment.duration ? ` Duración: ${emailAppointment.duration}.` : ''}\n\nPor favor, confirma que podrás asistir o avísanos si necesitas cambiar algo.`);
                        setShowEmailCustomInput(true);
                      }
                    }} className="flex-1 h-11 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm">
                      <option value="reminder">Recordatorio de Cita</option>
                      <option value="address">Dirección del Estudio</option>
                      <option value="custom">Personalizado</option>
                    </select>
                    <button onClick={() => setShowEmailCustomInput(!showEmailCustomInput)} className="w-11 h-11 bg-spa-elevated border border-white/5 rounded-xl flex items-center justify-center text-spa-gold hover:border-spa-gold transition-all shrink-0">
                      {showEmailCustomInput ? <X size={18}/> : <Plus size={18}/>}
                    </button>
                  </div>
                  {showEmailCustomInput && (
                    <textarea value={emailCustomText} onChange={e => setEmailCustomText(e.target.value)} placeholder="Escribe un mensaje adicional para el cliente..." rows={5} className="w-full bg-spa-elevated border border-white/5 rounded-xl px-4 py-3 outline-none focus:border-spa-gold text-sm resize-none" />
                  )}
                  <button onClick={handleSendCustomEmail} className="w-full h-12 bg-spa-gold text-spa-base font-bold uppercase tracking-[0.2em] rounded-xl hover:opacity-90 active:scale-95 transition-all text-xs shadow-xl">
                    Enviar Correo
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Edit Massage Modal (Servicios) */}
          {showServiciosEditModal && editMassageId && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[200] bg-spa-base/60 backdrop-blur-sm flex items-center justify-center p-4">
              <motion.div initial={{ y: 30, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, scale: 0.95 }} transition={{ type: "spring", damping: 28, stiffness: 300 }} className="w-full max-w-md bg-spa-card rounded-[24px] border border-white/10 shadow-2xl overflow-hidden">
                <div className="p-6 space-y-5">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-serif">Editar Masaje</h3>
                    <button onClick={() => { setShowServiciosEditModal(false); setEditMassageId(null); setNewMassage({ name: "", price: "", duration: "", description: "", intensity: "" }); }} className="p-1.5 bg-spa-elevated rounded-full hover:text-spa-gold transition-colors"><X size={18}/></button>
                  </div>
                  <div className="space-y-3">
                    <input value={newMassage.name} onChange={e => setNewMassage(p => ({...p, name: e.target.value}))} placeholder="Nombre" className="w-full h-12 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm" />
                    <div className="grid grid-cols-2 gap-3">
                      <input value={newMassage.price} onChange={e => setNewMassage(p => ({...p, price: e.target.value}))} placeholder="Precio" className="h-12 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm" />
                      <input value={newMassage.duration} onChange={e => setNewMassage(p => ({...p, duration: e.target.value}))} placeholder="Duración" className="h-12 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm" />
                    </div>
                    <textarea value={newMassage.description} onChange={e => setNewMassage(p => ({...p, description: e.target.value}))} placeholder="Descripción" rows={3} className="w-full h-24 bg-spa-elevated border border-white/5 rounded-xl px-4 py-3 outline-none focus:border-spa-gold text-sm resize-none" />
                    <select value={newMassage.intensity} onChange={e => setNewMassage(p => ({...p, intensity: e.target.value}))} className="w-full h-12 bg-spa-elevated border border-white/5 rounded-xl px-4 outline-none focus:border-spa-gold text-sm">
                      <option value="">Sin intensidad</option>
                      {intensityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => { handleAddMassageType(); setShowServiciosEditModal(false); }} className="flex-1 py-4 bg-spa-gold text-spa-base rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-all">Guardar Cambios</button>
                    <button onClick={() => { setShowServiciosEditModal(false); setEditMassageId(null); setNewMassage({ name: "", price: "", duration: "", description: "", intensity: "" }); }} className="px-6 py-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[10px] font-bold uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all">Cancelar</button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Info Modal */}
          {infoModalMassage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInfoModalMassage(null)}
              className="absolute inset-0 z-[150] bg-black/60 backdrop-blur-md flex items-end sm:items-center justify-center p-6"
            >
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm bg-spa-card rounded-[24px] sm:rounded-[32px] border border-white/10 shadow-2xl overflow-hidden"
              >
                <div className="p-6 sm:p-8">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-serif text-spa-crema">{infoModalMassage.name}</h3>
                    <button onClick={() => setInfoModalMassage(null)} className="p-1.5 bg-spa-elevated rounded-full hover:text-spa-gold transition-colors"><X size={18}/></button>
                  </div>
                  <p className="text-sm text-spa-crema/70 leading-relaxed">{infoModalMassage.description}</p>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Bot Interface */}
          {showBot && (
             <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} className="fixed bottom-24 right-6 w-[calc(100vw-48px)] max-w-[350px] h-[500px] max-h-[70vh] bg-spa-card border border-white/10 rounded-[28px] shadow-2xl flex flex-col z-50 overflow-hidden glow-gold">
                <div className="p-5 border-b border-white/5 flex items-center justify-between bg-spa-elevated">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-spa-gold to-spa-accent flex items-center justify-center text-spa-base font-serif text-lg font-bold">JP</div>
                        <div>
                           <h3 className="text-xs font-bold uppercase tracking-widest">Asistente</h3>
                           <p className="text-[9px] text-spa-gold font-medium">Agente IA</p>
                        </div>
                    </div>
                    <button onClick={()=>setShowBot(false)} className="p-2 text-[#7A7D7B] hover:text-spa-crema"><X size={18}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                    <div className="self-start max-w-[85%] bg-spa-elevated p-5 rounded-2xl rounded-tl-sm text-sm font-light leading-relaxed border border-white/5 relative">
                        Bienvenido. Soy el asistente de Jean Pierre. ¿Cómo puedo ayudarte con tu reserva hoy?
                        <div className="absolute top-0 -left-2 w-4 h-4 bg-spa-elevated clip-path-triangle" />
                    </div>
                    {botStep === "greeting" && (
                        <div className="flex flex-col gap-3">
                            <button onClick={() => setBotStep("ask_email")} className="w-full py-4 bg-spa-accent text-spa-crema rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-spa-gold hover:text-spa-base transition-all shadow-lg">Consultar / Cancelar Cita</button>
                            <button onClick={() => { setShowBot(false); toast.info("Selecciona un día y hora en el calendario"); }} className="w-full py-4 bg-spa-elevated border border-white/5 text-spa-crema rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:border-spa-gold transition-all">Nueva Reserva</button>
                        </div>
                    )}

                    {botStep === "ask_email" && (
                        <div className="space-y-4">
                            <p className="text-[10px] text-spa-gold font-bold uppercase tracking-widest px-2">Introduce tu Email</p>
                            <div className="relative">
                                <input 
                                    type="email" autoFocus
                                    id="bot-email-input"
                                    className="w-full h-14 bg-spa-elevated border border-white/5 rounded-2xl px-5 pr-14 outline-none focus:border-spa-gold transition-all text-sm"
                                    placeholder="ejemplo@correo.com"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            const val = (e.target as HTMLInputElement).value;
                                            if (val) {
                                                setBotData({...botData, email: val});
                                                setBotStep("ask_verification");
                                            }
                                        }
                                    }}
                                />
                                <button 
                                    onClick={() => {
                                        const el = document.getElementById("bot-email-input") as HTMLInputElement;
                                        if (el.value) {
                                            setBotData({...botData, email: el.value});
                                            setBotStep("ask_verification");
                                        }
                                    }}
                                    className="absolute right-2 top-2 w-10 h-10 bg-spa-accent rounded-xl flex items-center justify-center text-spa-crema hover:bg-spa-gold transition-all"
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                            <button onClick={() => setBotStep("greeting")} className="text-[9px] text-[#7A7D7B] uppercase font-bold hover:text-spa-crema px-2">← Volver</button>
                        </div>
                    )}

                    {botStep === "ask_verification" && (
                        <div className="space-y-4">
                            <p className="text-[10px] text-spa-gold font-bold uppercase tracking-widest px-2">Verificación (Nombre o Teléfono)</p>
                            <div className="relative">
                                <input 
                                    type="text" autoFocus
                                    id="bot-verify-input"
                                    className="w-full h-14 bg-spa-elevated border border-white/5 rounded-2xl px-5 pr-14 outline-none focus:border-spa-gold transition-all text-sm"
                                    placeholder="Tu nombre o teléfono..."
                                    onKeyDown={async (e) => {
                                        if (e.key === "Enter") {
                                            handleBotVerify((e.target as HTMLInputElement).value);
                                        }
                                    }}
                                />
                                <button 
                                    onClick={() => {
                                        const el = document.getElementById("bot-verify-input") as HTMLInputElement;
                                        handleBotVerify(el.value);
                                    }}
                                    className="absolute right-2 top-2 w-10 h-10 bg-spa-accent rounded-xl flex items-center justify-center text-spa-crema hover:bg-spa-gold transition-all"
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                            <button onClick={() => setBotStep("ask_email")} className="text-[9px] text-[#7A7D7B] uppercase font-bold hover:text-spa-crema px-2">← Cambiar Email</button>
                        </div>
                    )}

                    {botStep === "show_appointments" && (
                        <div className="space-y-4">
                            <p className="text-[10px] text-spa-gold font-bold uppercase tracking-widest px-2">Tus Próximas Citas</p>
                            {botData.appts.map(a => (
                                <div key={a.id} className="bg-spa-elevated p-5 rounded-2xl border border-white/5 space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-xs font-serif text-spa-crema">{format(parseISO(a.startTime), "EEEE d 'de' MMMM", { locale: es })}</p>
                                            <p className="text-[10px] text-spa-gold font-bold uppercase tracking-widest mt-1">{format(parseISO(a.startTime), "HH:mm")}</p>
                                        </div>
                                        <div className="px-2 py-1 bg-spa-accent/10 border border-spa-accent/20 rounded-md text-[8px] font-bold text-spa-gold uppercase tracking-tighter">Confirmada</div>
                                    </div>
                                    <div className="flex gap-2 pt-2">
                                        <button onClick={() => { setBotData({...botData, selectedApptId: a.id!}); setBotStep("reschedule"); }} className="flex-1 py-3 bg-spa-accent/10 border border-spa-accent/30 rounded-xl text-[9px] font-bold uppercase tracking-widest text-spa-gold hover:bg-spa-accent hover:text-spa-base transition-all">Reagendar</button>
                                        <button onClick={async () => {
                                            if (confirm("¿Estás seguro de cancelar?")) {
                                                await fetch(`/api/appointments/${a.id}`, { method: "DELETE" });
                                                toast.success("Cita cancelada");
                                                setBotStep("greeting");
                                            }
                                        }} className="px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-[9px] font-bold uppercase tracking-widest text-rose-500 hover:bg-rose-500 hover:text-white transition-all"><Trash2 size={14}/></button>
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => setBotStep("greeting")} className="w-full py-3 bg-white/5 rounded-xl text-[9px] font-bold uppercase tracking-widest text-[#7A7D7B] hover:text-spa-crema transition-all">Finalizar</button>
                        </div>
                    )}

                    {botStep === "reschedule" && (
                        <div className="space-y-4 text-center">
                            <p className="text-[10px] text-spa-gold font-bold uppercase tracking-widest">Selecciona Nuevo Horario</p>
                            <p className="text-xs text-[#7A7D7B]">Pulsa una hora disponible en el calendario principal y luego confirma aquí.</p>
                            
                            {botRescheduleSlot ? (
                                <div className="bg-spa-accent/10 p-5 rounded-2xl border border-spa-accent/30 space-y-4">
                                    <p className="text-xs font-serif text-spa-crema">Nuevo Horario:</p>
                                    <p className="text-lg font-serif text-spa-gold">{format(botRescheduleSlot, "EEEE d 'de' MMMM, HH:mm", { locale: es })}</p>
                                    <button onClick={async () => {
                                        await fetch(`/api/bot/appointments/${botData.selectedApptId}/reschedule`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ newStartTime: botRescheduleSlot.toISOString() })
                                        });
                                        toast.success("Cita reprogramada");
                                        fetchAppointments();
                                        setBotStep("greeting");
                                        setBotRescheduleSlot(null);
                                    }} className="w-full py-4 bg-spa-gold text-spa-base rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-xl">Confirmar Cambio</button>
                                </div>
                            ) : (
                                <div className="py-10 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center gap-3">
                                    <CalendarIcon className="text-[#7A7D7B] opacity-30" size={32} />
                                    <p className="text-[10px] text-[#7A7D7B] uppercase font-bold tracking-widest">Esperando selección...</p>
                                </div>
                            )}
                            <button onClick={() => setBotStep("show_appointments")} className="text-[9px] text-[#7A7D7B] uppercase font-bold hover:text-spa-crema">← Cancelar</button>
                        </div>
                    )}
                </div>
             </motion.div>
          )}

          {/* Side Menu */}
          {showSideMenu && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSideMenu(false)} className="absolute inset-0 z-[60] bg-black/30" />
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.9 }}
                transition={{ type: "spring", damping: 25, stiffness: 350 }}
                className="absolute bottom-24 inset-x-0 z-[70] flex justify-center px-8"
              >
                <div className="w-full max-w-[280px] bg-spa-card rounded-[24px] border border-white/10 shadow-2xl p-6 flex flex-col items-center gap-5">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-spa-gold to-spa-accent flex items-center justify-center text-spa-base shadow-lg">
                      <Leaf size={22} />
                    </div>
                    <span className="text-[8px] font-bold text-spa-gold uppercase tracking-[0.3em]">JP Masajes</span>
                  </div>
                  <div className="w-full space-y-2">
                    <button onClick={() => { setShowSideMenu(false); setShowBot(true); }} className="w-full flex items-center gap-3 p-3.5 bg-spa-elevated rounded-xl border border-white/5 hover:border-spa-gold/30 hover:bg-spa-accent/10 transition-all group">
                      <div className="w-9 h-9 rounded-lg bg-spa-accent/10 flex items-center justify-center text-spa-gold group-hover:bg-spa-gold group-hover:text-spa-base transition-all shrink-0"><CalendarIcon size={16}/></div>
                      <span className="text-sm font-medium">Gestionar Cita</span>
                    </button>
                    <button onClick={() => { setShowSideMenu(false); setShowServices(true); }} className="w-full flex items-center gap-3 p-3.5 bg-spa-elevated rounded-xl border border-white/5 hover:border-spa-gold/30 hover:bg-spa-accent/10 transition-all group">
                      <div className="w-9 h-9 rounded-lg bg-spa-accent/10 flex items-center justify-center text-spa-gold group-hover:bg-spa-gold group-hover:text-spa-base transition-all shrink-0"><Leaf size={16}/></div>
                      <span className="text-sm font-medium">Servicios</span>
                    </button>
                    {isAdminAuth ? (
                      <button onClick={() => { setShowSideMenu(false); setShowAdminPanel(true); }} className="w-full flex items-center gap-3 p-3.5 bg-spa-elevated rounded-xl border border-white/5 hover:border-spa-gold/30 hover:bg-spa-accent/10 transition-all group">
                        <div className="w-9 h-9 rounded-lg bg-spa-gold flex items-center justify-center text-spa-base shrink-0"><User size={16}/></div>
                        <span className="text-sm font-medium">Administración</span>
                      </button>
                    ) : (
                      <a href="/api/auth/google" className="w-full flex items-center gap-3 p-3.5 bg-spa-elevated rounded-xl border border-white/5 hover:border-spa-gold/30 hover:bg-spa-accent/10 transition-all group">
                        <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-spa-crema group-hover:bg-spa-gold group-hover:text-spa-base transition-all shrink-0"><User size={16}/></div>
                        <span className="text-sm font-medium">Acceso Admin</span>
                      </a>
                    )}
                  </div>
                  {isAdminAuth && (
                    <button onClick={handleLogout} className="flex items-center gap-2 text-rose-500 text-[10px] font-bold uppercase tracking-widest hover:text-rose-400 transition-all">
                      <LogOut size={12}/> Cerrar Sesión
                    </button>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
