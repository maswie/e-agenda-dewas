import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    signInAnonymously,
    signInWithCustomToken
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    setDoc, 
    deleteDoc, 
    query, 
    where, 
    onSnapshot,
    Timestamp
} from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';

// Import icons from lucide-react
import { 
    CalendarDays, ClipboardList, Users, LogIn, LogOut, PlusCircle, Trash2, Edit3, Settings, 
    Sun, Moon, Briefcase, Clock, ChevronLeft, ChevronRight, Paperclip, MapPin, Send, AlertTriangle, CheckCircle, XCircle, Info
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyA0uIa7mJZDpHZqmX1ft7GfQUjKT4Nnol4",
  authDomain: "e-agenda-dewas.firebaseapp.com",
  projectId: "e-agenda-dewas",
  storageBucket: "e-agenda-dewas.firebasestorage.app",
  messagingSenderId: "352097763079",
  appId: "1:352097763079:web:1b8f633b0d38fc5b654fa2",
  measurementId: "G-JP6S8XPQNK"
};

// Global Firebase variables provided by Canvas environment
//const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: "DEMO_API_KEY", authDomain: "DEMO_AUTH_DOMAIN", projectId: "DEMO_PROJECT_ID" }; // Fallback for local dev
//const appId = typeof __app_id !== 'undefined' ? __app_id : 'e-agenda-dewas';
const appId = firebaseConfig.projectId || 'e-agenda-dewas';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
setLogLevel('debug'); // Firebase logging

// --- Helper Functions ---
const formatDate = (date, options = { year: 'numeric', month: 'long', day: 'numeric' }) => {
    if (!date) return '';
    if (date instanceof Timestamp) {
        date = date.toDate();
    }
    return new Intl.DateTimeFormat('id-ID', options).format(date);
};

const formatTime = (timeStr) => { // timeStr is "HH:MM"
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
};

const getDayName = (date) => {
    if (date instanceof Timestamp) {
        date = date.toDate();
    }
    return new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(date);
};

const DEFAULT_ACTIVITIES = [
    { id: 'default1', startTime: '08:00', endTime: '09:00', agenda: "Do'a pagi & Morning Briefing OPD", location: 'Kantor Pusat BPKH', participants: ['Semua Anggota OPD'], isDefault: true },
    { id: 'default2', startTime: '12:00', endTime: '13:00', agenda: "Time Break - Istirahat, Sholat", location: 'Area Istirahat/Musholla', participants: ['Pribadi'], isDefault: true },
    { id: 'default3', startTime: '17:00', endTime: '17:30', agenda: "Presensi pulang", location: 'Kantor Pusat BPKH', participants: ['Semua Pegawai'], isDefault: true },
];


const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const getSlaStatusInfo = (slaTimestamp) => {
    // Handle jika SLA tidak diisi (opsional)
    if (!slaTimestamp) { // Ini akan menangkap null, undefined
        return { text: "Tidak ada SLA", colorClass: "bg-gray-100 text-gray-600", Icon: Info, sortOrder: 5 }; // Urutan sortir paling akhir
    }

    // Jika slaTimestamp ada tapi bukan instance dari Timestamp (misalnya, data lama yang salah format)
    if (!(slaTimestamp instanceof Timestamp)) {
        console.warn("getSlaStatusInfo menerima SLA yang bukan Timestamp:", slaTimestamp);
        return { text: "Format SLA Invalid", colorClass: "text-yellow-500 bg-yellow-100", Icon: AlertTriangle, sortOrder: 4 };
    }

    const slaDate = slaTimestamp.toDate();
    const today = new Date();

    // Normalisasi ke awal hari untuk perbandingan tanggal yang akurat
    const slaDateNormalized = new Date(slaDate.getFullYear(), slaDate.getMonth(), slaDate.getDate());
    const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day
    const diffDays = Math.round((slaDateNormalized.getTime() - todayNormalized.getTime()) / oneDay);

    if (diffDays < 0) {
        return { text: `Lewat ${Math.abs(diffDays)} hari`, colorClass: "bg-red-100 text-red-700", Icon: XCircle, sortOrder: 0 };
    } else if (diffDays === 0) {
        return { text: "SLA Hari Ini", colorClass: "bg-yellow-100 text-yellow-700", Icon: AlertTriangle, sortOrder: 1 };
    } else if (diffDays === 1) {
        return { text: "SLA Besok", colorClass: "bg-orange-100 text-orange-700", Icon: AlertTriangle, sortOrder: 2 };
    } else {
        // Jika masih jauh, tampilkan tanggal SLA nya
        return { text: `SLA: ${formatDate(slaDate)}`, colorClass: "bg-green-100 text-green-700", Icon: CheckCircle, sortOrder: 3 };
    }
};

const getSevenDaysFromToday = () => {
    const today = new Date(); // Mendapatkan tanggal dan waktu saat ini
    const sevenDaysAhead = []; // Array untuk menyimpan 7 tanggal
    for (let i = 0; i < 7; i++) { // Looping 7 kali (untuk hari ini + 6 hari ke depan)
        const currentDate = new Date(today); // Buat objek Date baru berdasarkan 'today'
        currentDate.setDate(today.getDate() + i); // Tambahkan 'i' hari ke tanggal 'today'
        // Contoh:
        // i=0 -> hari ini
        // i=1 -> besok
        // i=2 -> lusa, dst.
        sevenDaysAhead.push(currentDate); // Masukkan tanggal yang sudah dihitung ke array
    }
    return sevenDaysAhead; // Kembalikan array berisi 7 objek Date
};

const App = () => {
    const [currentPage, setCurrentPage] = useState('PUBLIC_DAILY_SCHEDULE');
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId, setUserId] = useState(null);

    const [selectedDate, setSelectedDate] = useState(new Date());
    const [schedules, setSchedules] = useState([]);
    const [holidays, setHolidays] = useState({}); // { 'YYYY-MM-DD': true }
    const [pendingItems, setPendingItems] = useState([]); // { type: 'letter' | 'proposal', ... }
    const [participants, setParticipants] = useState([]); // { id, name }
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState('');

    // Firebase Auth State Change Listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setCurrentUser(user);
                setUserId(user.uid);
            } else {
                // Untuk akses publik ketika tidak ada pengguna yang login (misalnya, admin belum login)
                // Kita akan mencoba login secara anonim.
                try {
                    console.log("Tidak ada user aktif, mencoba login anonim...");
                    await signInAnonymously(auth);
                    // onAuthStateChanged akan dipicu lagi dengan pengguna anonim,
                    // yang kemudian akan di-set ke currentUser dan userId.
                } catch (e) {
                    console.error("Error saat login anonim:", e);
                    // Handle error jika login anonim gagal, mungkin tampilkan pesan error ke pengguna
                    // atau biarkan aplikasi dalam keadaan "belum terautentikasi".
                }
            }
            setIsAuthReady(true);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const dbPath = useCallback((collectionName) => {
        if (!isAuthReady) return null; // Wait for auth to be ready
        // Public data path
        return `artifacts/${appId}/public/data/${collectionName}`;
    }, [isAuthReady]);

    // Fetch Schedules
    useEffect(() => {
        if (!isAuthReady || !dbPath('schedules')) return;
        const schedulesCollection = collection(db, dbPath('schedules'));
        const q = query(schedulesCollection); // Later, you might want to query by date range for optimization
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedSchedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSchedules(fetchedSchedules);
        }, (err) => {
            console.error("Error fetching schedules:", err);
            setError("Gagal memuat jadwal.");
        });
        return () => unsubscribe();
    }, [isAuthReady, dbPath]);

    // Fetch Holidays
    useEffect(() => {
        if (!isAuthReady || !dbPath('holidays')) return;
        const holidaysCollection = collection(db, dbPath('holidays'));
        const unsubscribe = onSnapshot(holidaysCollection, (snapshot) => {
            const fetchedHolidays = {};
            snapshot.docs.forEach(doc => {
                fetchedHolidays[doc.id] = doc.data(); // doc.id is 'YYYY-MM-DD'
            });
            setHolidays(fetchedHolidays);
        }, (err) => {
            console.error("Error fetching holidays:", err);
            setError("Gagal memuat data hari libur.");
        });
        return () => unsubscribe();
    }, [isAuthReady, dbPath]);

    // Fetch Pending Items
    useEffect(() => {
        if (!isAuthReady || !dbPath('pendingItems')) return;
        const pendingItemsCollection = collection(db, dbPath('pendingItems'));
        const unsubscribe = onSnapshot(pendingItemsCollection, (snapshot) => {
            const fetchedItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPendingItems(fetchedItems);
        }, (err) => {
            console.error("Error fetching pending items:", err);
            setError("Gagal memuat data pending.");
        });
        return () => unsubscribe();
    }, [isAuthReady, dbPath]);
    
    // Fetch Participants
    useEffect(() => {
        if (!isAuthReady || !dbPath('participants')) return;
        const participantsCollection = collection(db, dbPath('participants'));
        const unsubscribe = onSnapshot(participantsCollection, (snapshot) => {
            const fetchedParticipants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setParticipants(fetchedParticipants);
        }, (err) => {
            console.error("Error fetching participants:", err);
            setError("Gagal memuat daftar peserta.");
        });
        return () => unsubscribe();
    }, [isAuthReady, dbPath]);

      const handleLogout = async () => {
        try {
            await signOut(auth);
            setCurrentUser(null); // Ini akan memicu onAuthStateChanged
            setUserId(null);
            setCurrentPage('PUBLIC_DAILY_SCHEDULE');
            // Komentari baris di bawah ini:
            // await signInAnonymously(auth); 
            setSuccessMessage('Anda telah berhasil logout.');
        } catch (error) {
            console.error("Error detail saat logout:", error); // Periksa ini di console browser
            let displayErrorMessage = "Gagal logout.";
            if (error.message) {
                displayErrorMessage += ` Pesan: ${error.message}`;
            }
            if (error.code) {
                displayErrorMessage += ` Kode: ${error.code}`;
            }
            showError(displayErrorMessage);
        }
      };

    const isWeekend = (date) => {
        const day = date.getDay();
        return day === 0 || day === 6; // Sunday or Saturday
    };

    const dateToYYYYMMDD = (date) => {
        if (date instanceof Timestamp) date = date.toDate();
        return date.toISOString().split('T')[0];
    };
    
    const isHoliday = (date) => {
        return !!holidays[dateToYYYYMMDD(date)];
    };

    const getDailySchedule = (date) => {
        const dateStr = dateToYYYYMMDD(date);
        const daySchedules = schedules
            .filter(s => s.date === dateStr || (s.date instanceof Timestamp && dateToYYYYMMDD(s.date) === dateStr))
            .map(s => ({...s, isDefault: false}));

        let fullDaySchedule = [];
        if (!isHoliday(date) && !isWeekend(date)) {
            fullDaySchedule = [...DEFAULT_ACTIVITIES];
        }
        
        fullDaySchedule = [...fullDaySchedule, ...daySchedules];
        return fullDaySchedule.sort((a, b) => a.startTime.localeCompare(b.startTime));
    };
    
    const getWeekRange = (date) => {
        const start = new Date(date);
        const dayOfWeek = start.getDay(); // 0 (Sun) - 6 (Sat)
        const diff = start.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust for Sunday
        start.setDate(diff);

        const week = [];
        for (let i = 0; i < 5; i++) { // Monday to Friday
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + i);
            week.push(currentDate);
        }
        return week;
    };

    const showSuccess = (message) => {
        setSuccessMessage(message);
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    const showError = (message) => {
        setError(message);
        setTimeout(() => setError(''), 3000);
    };

    // --- Render Logic ---
    if (loading || !isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-center">
                    <Briefcase className="w-16 h-16 text-blue-600 mx-auto animate-pulse" />
                    <p className="text-xl font-semibold mt-4">Memuat Aplikasi Jadwal BPKH...</p>
                </div>
            </div>
        );
    }
    
    const pendingLettersCount = pendingItems.filter(item => item.type === 'letter').length;
    const pendingProposalsCount = pendingItems.filter(item => item.type === 'proposal').length;

    return (
        <div className="min-h-screen bg-slate-100 font-sans">
            {/* Header */}
            <header className="bg-gradient-to-r from-blue-700 to-blue-900 text-white shadow-lg">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center">
                    <div className="flex items-center space-x-3 mb-2 sm:mb-0">
                        <Briefcase size={36} />
                        <h1 className="text-2xl font-bold tracking-tight">Jadwal Dewan Pengawas BPKH</h1>
                    </div>
                    <div className="flex items-center space-x-2">
                        {currentUser && currentUser.email ? ( // Assuming admin logs in with email
                            <>
                                <span className="text-sm hidden sm:inline">Admin: {currentUser.email}</span>
                                <button
                                    onClick={handleLogout}
                                    className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-150 ease-in-out flex items-center space-x-2"
                                >
                                    <LogOut size={18} />
                                    <span>Logout</span>
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setCurrentPage('ADMIN_LOGIN')}
                                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-150 ease-in-out flex items-center space-x-2"
                            >
                                <LogIn size={18} />
                                <span>Login Admin</span>
                            </button>
                        )}
                    </div>
                </div>
                 {/* Navigation */}
                <nav className="bg-blue-800">
                    <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start space-x-1 sm:space-x-2 md:space-x-4 py-2">
                            {[
                                { label: 'Jadwal Harian', page: 'PUBLIC_DAILY_SCHEDULE', icon: CalendarDays },
                                { label: 'Agenda Pekanan', page: 'PUBLIC_WEEKLY_AGENDA', icon: CalendarDays },
                                { 
                                    label: 'Pending Surat', 
                                    page: 'PUBLIC_PENDING_LETTERS', 
                                    icon: ClipboardList, 
                                    count: pendingLettersCount 
                                },
                                { 
                                    label: 'Pending Proposal', 
                                    page: 'PUBLIC_PENDING_PROPOSALS', 
                                    icon: ClipboardList, 
                                    count: pendingProposalsCount
                                },
                                ...(currentUser && currentUser.email ? [ // Show admin links if logged in as admin
                                    { label: 'Kelola Jadwal', page: 'ADMIN_MANAGE_SCHEDULE', icon: Settings },
                                    { label: 'Kelola Hari Libur', page: 'ADMIN_MANAGE_HOLIDAYS', icon: Sun },
                                    { label: 'Kelola Pending Item', page: 'ADMIN_MANAGE_PENDING_ITEMS', icon: Edit3 },
                                    { label: 'Kelola Peserta', page: 'ADMIN_MANAGE_PARTICIPANTS', icon: Users },
                                    { label: 'Kirim Notifikasi', page: 'ADMIN_WHATSAPP_SHARE', icon: Send },
                                ] : [])
                            ].map(item => (
                                <button
                                    key={item.page}
                                    onClick={() => setCurrentPage(item.page)}
                                    className={`relative px-3 py-2 my-1 rounded-md text-sm font-medium flex items-center space-x-2 transition-colors duration-150
                                        ${currentPage === item.page ? 'bg-white text-blue-700 shadow-md' : 'text-blue-100 hover:bg-blue-700 hover:text-white'}`}
                                >
                                    <item.icon size={16} />
                                    <span>{item.label}</span>
                                    {item.count > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                                            {item.count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </nav>
            </header>

            {/* Main Content */}
            <main className="container mx-auto p-4 sm:p-6 lg:p-8">
                {/* Notification Area */}
                {error && <AlertMessage type="error" message={error} onClose={() => setError('')} />}
                {successMessage && <AlertMessage type="success" message={successMessage} onClose={() => setSuccessMessage('')} />}

                {/* Page Content */}
                {renderPageContent()}
            </main>

            {/* Footer */}
            <footer className="bg-gray-800 text-white text-center py-6 mt-auto">
                <p>© {new Date().getFullYear()} Sekretariat Dewan Pengawas BPKH. Hak Cipta Dilindungi.</p>
                <p className="text-xs mt-1">UID: {userId || 'Belum Terautentikasi'} | App ID: {appId}</p>
            </footer>
        </div>
    );

    function AlertMessage({ type, message, onClose }) {
        const bgColor = type === 'error' ? 'bg-red-100 border-red-400 text-red-700' : 'bg-green-100 border-green-400 text-green-700';
        const Icon = type === 'error' ? XCircle : CheckCircle;
        return (
            <div className={`border rounded-lg p-4 mb-4 flex items-center space-x-3 shadow ${bgColor}`} role="alert">
                <Icon className={`w-6 h-6 ${type === 'error' ? 'text-red-500' : 'text-green-500'}`} />
                <span className="flex-grow">{message}</span>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                    <XCircle size={20} />
                </button>
            </div>
        );
    }

    function renderPageContent() {
        // Public Views
        if (currentPage === 'PUBLIC_DAILY_SCHEDULE') {
            return <DailyScheduleView date={selectedDate} setDate={setSelectedDate} getDailySchedule={getDailySchedule} isHoliday={isHoliday} />;
        }
        if (currentPage === 'PUBLIC_WEEKLY_AGENDA') {
            return <WeeklyAgendaView selectedDate={selectedDate} getDailySchedule={getDailySchedule} getWeekRange={getWeekRange} isHoliday={isHoliday} />;
        }
        if (currentPage === 'PUBLIC_PENDING_LETTERS') {
            return <PendingItemsView items={pendingItems.filter(item => item.type === 'letter')} title="Pending Surat" />;
        }
        if (currentPage === 'PUBLIC_PENDING_PROPOSALS') {
            return <PendingItemsView items={pendingItems.filter(item => item.type === 'proposal')} title="Pending Proposal" />;
        }

        // Admin Views
        if (currentPage === 'ADMIN_LOGIN') {
            return <AdminLogin setCurrentPage={setCurrentPage} setCurrentUser={setCurrentUser} setUserId={setUserId} showSuccess={showSuccess} showError={showError} />;
        }

        // Protected Admin Routes
        if (currentUser && currentUser.email) { // Check if admin is logged in
            if (currentPage === 'ADMIN_MANAGE_SCHEDULE') {
                return <AdminManageSchedule schedules={schedules} participants={participants} dbPath={dbPath} showSuccess={showSuccess} showError={showError} />;
            }
            if (currentPage === 'ADMIN_MANAGE_HOLIDAYS') {
                return <AdminManageHolidays holidays={holidays} dbPath={dbPath} showSuccess={showSuccess} showError={showError} />;
            }
            if (currentPage === 'ADMIN_MANAGE_PENDING_ITEMS') {
                return <AdminManagePendingItems pendingItems={pendingItems} dbPath={dbPath} showSuccess={showSuccess} showError={showError} />;
            }
            if (currentPage === 'ADMIN_MANAGE_PARTICIPANTS') {
                return <AdminManageParticipants participants={participants} dbPath={dbPath} showSuccess={showSuccess} showError={showError} />;
            }
            if (currentPage === 'ADMIN_WHATSAPP_SHARE') {
                return <AdminWhatsAppShare 
                            selectedDate={selectedDate} 
                            getDailySchedule={getDailySchedule}
                            getWeekRange={getWeekRange}
                            pendingLetters={pendingItems.filter(item => item.type === 'letter')}
                            pendingProposals={pendingItems.filter(item => item.type === 'proposal')}
                            isHoliday={isHoliday}
                            showSuccess={showSuccess}
                        />;
            }
            // Fallback for admin to daily schedule if no specific admin page is selected
            if (currentPage.startsWith('ADMIN_') && currentPage !== 'ADMIN_LOGIN') {
                 setCurrentPage('PUBLIC_DAILY_SCHEDULE'); // Or an Admin Dashboard
                 return <DailyScheduleView date={selectedDate} setDate={setSelectedDate} getDailySchedule={getDailySchedule} isHoliday={isHoliday} />;
            }
        } else if (currentPage.startsWith('ADMIN_') && currentPage !== 'ADMIN_LOGIN') {
            // If trying to access admin page without login, redirect to login
            setCurrentPage('ADMIN_LOGIN');
            return <AdminLogin setCurrentPage={setCurrentPage} setCurrentUser={setCurrentUser} setUserId={setUserId} showSuccess={showSuccess} showError={showError} />;
        }
        
        // Default fallback if no page matches (should ideally not happen with proper navigation)
        return <DailyScheduleView date={selectedDate} setDate={setSelectedDate} getDailySchedule={getDailySchedule} isHoliday={isHoliday} />;
    }
};


// --- Public View Components ---
const DailyScheduleView = ({ date, setDate, getDailySchedule, isHoliday }) => {
    const dailySchedule = getDailySchedule(date);
    const holidayInfo = isHoliday(date);

    const changeDate = (offset) => {
        const newDate = new Date(date);
        newDate.setDate(date.getDate() + offset);
        setDate(newDate);
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-xl">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 pb-4 border-b border-gray-200">
                <h2 className="text-3xl font-bold text-gray-800 mb-2 sm:mb-0">
                    Jadwal Harian: {getDayName(date)}, {formatDate(date)}
                </h2>
                <div className="flex items-center space-x-2">
                    <button onClick={() => changeDate(-1)} className="p-2 rounded-full hover:bg-gray-200 transition duration-150"><ChevronLeft size={24} className="text-gray-600" /></button>
                    <input 
                        type="date" 
                        value={date.toISOString().split('T')[0]} 
                        onChange={(e) => setDate(new Date(e.target.value))}
                        className="p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button onClick={() => changeDate(1)} className="p-2 rounded-full hover:bg-gray-200 transition duration-150"><ChevronRight size={24} className="text-gray-600" /></button>
                </div>
            </div>

            {holidayInfo && (
                <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6 rounded-md shadow">
                    <div className="flex items-center">
                        <AlertTriangle className="h-6 w-6 text-yellow-500 mr-3" />
                        <p className="font-semibold">HARI LIBUR: {holidayInfo.name || 'Hari Libur Nasional/Cuti Bersama'}</p>
                    </div>
                </div>
            )}

            {dailySchedule.length === 0 && !holidayInfo && (
                 <div className="text-center py-10">
                    <Info size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-500 text-lg">Tidak ada agenda terjadwal untuk hari ini.</p>
                </div>
            )}

                        <div className="space-y-4">
                {dailySchedule.map((item, index) => (
                    <div key={item.id || `default-${index}`} className={`p-4 rounded-lg shadow-md border-l-4 ${item.isDefault ? 'bg-blue-50 border-blue-400' : 'bg-green-50 border-green-500'}`}>
                        {/* GANTI STRUKTUR DI BAWAH INI */}
                        <div className="flex flex-col md:flex-row md:gap-x-6 lg:gap-x-8"> {/* Kontainer utama untuk dua kolom */}
                            
                            {/* Kolom Kiri (sekitar 60% atau sesuai kebutuhan) */}
                            <div className="md:w-3/5 flex-grow space-y-1.5 mb-3 md:mb-0">
                                <p className="text-lg font-semibold text-gray-800">{item.agenda}</p>
                                <p className="text-sm text-gray-600 flex items-center">
                                    <Clock size={14} className="mr-1.5 text-gray-500 flex-shrink-0" /> 
                                    <span>{formatTime(item.startTime)} - {formatTime(item.endTime)}</span>
                                </p>
                                
                                {item.notes && (
                                    <div className="pt-1">
                                        <p className="text-xs font-medium text-gray-700">Catatan:</p>
                                        <p className="text-xs text-gray-500 italic">{item.notes}</p>
                                    </div>
                                )}

                                {item.uploadedFiles && item.uploadedFiles.length > 0 && (
                                    <div className="pt-1">
                                        <p className="text-xs font-medium text-gray-700">Materi:</p>
                                        <ul className="list-none pl-0 space-y-0.5">
                                            {item.uploadedFiles.map((file, idx) => (
                                                <li key={idx} className="text-xs">
                                                    <a 
                                                        href={file.url || '#'} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        className="text-blue-600 hover:text-blue-700 hover:underline flex items-center group"
                                                    >
                                                        <Paperclip size={12} className="mr-1.5 text-gray-500 group-hover:text-blue-600 flex-shrink-0" />
                                                        <span className="truncate" title={file.name}>{file.name || "Tanpa Nama"}</span>
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {/* Kolom Kanan (sekitar 40% atau sesuai kebutuhan) */}
                            <div className="md:w-2/5 flex-grow space-y-1 md:border-l md:pl-6 lg:pl-8 border-gray-200">
                                <div className="text-sm text-gray-700">
                                    <p className="flex items-start">
                                        <MapPin size={14} className="mr-2 mt-[3px] text-gray-500 flex-shrink-0" />
                                        <span className="text-left">{item.location}</span> {/* Rata kiri secara default */}
                                    </p>
                                </div>
                                <div className="text-sm text-gray-700">
                                    <p className="flex items-start">
                                        <Users size={14} className="mr-2 mt-[3px] text-gray-500 flex-shrink-0" />
                                        <span className="text-left"> {/* Rata kiri secara default */}
                                            {Array.isArray(item.participants) ? item.participants.join(', ') : item.participants}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

    const WeeklyAgendaView = ({ getDailySchedule, isHoliday }) => {
      const weekDates = getSevenDaysFromToday()

    return (
        <div className="bg-white p-6 rounded-xl shadow-xl">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 pb-4 border-b border-gray-200">
                Agenda Pekanan Tentatif
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
                {weekDates.map(date => {
                    const dailySchedule = getDailySchedule(date);
                    const holidayInfo = isHoliday(date);
                    return (
                        <div key={date.toISOString()} className="bg-gray-50 p-4 rounded-lg shadow">
                            <h3 className="font-semibold text-lg text-blue-700 mb-1">{getDayName(date)}</h3>
                            <p className="text-xs text-gray-500 mb-3">{formatDate(date, {day: 'numeric', month: 'short'})}</p>
                            
                            {holidayInfo && (
                                <div className="bg-yellow-100 border-yellow-400 text-yellow-700 text-xs p-2 mb-2 rounded">
                                    HARI LIBUR: {holidayInfo.name || ''}
                                </div>
                            )}

                            {dailySchedule.length === 0 && !holidayInfo && (
                                <p className="text-xs text-gray-400 italic">Tidak ada agenda.</p>
                            )}
                            <div className="space-y-2">
                            {dailySchedule.map((item, index) => (
                                <div key={item.id || `default-week-${index}`} className={`p-2 rounded text-xs ${item.isDefault ? 'bg-blue-100' : 'bg-green-100'}`}>
                                    <p className="font-medium text-gray-700 truncate" title={item.agenda}>{item.agenda}</p>
                                    <p className="text-gray-500">{formatTime(item.startTime)} - {formatTime(item.endTime)}</p>
                                </div>
                            ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const DataItem = ({ label, value, valueClassName = "text-gray-800" }) => (
    <div className="flex justify-between items-start py-1.5 border-b border-slate-200 last:border-b-0">
        <span className="text-xs font-medium text-slate-600 flex-shrink-0 mr-2">{label}:</span>
        <span className={`text-xs ${valueClassName} text-right break-words`}>{value || '-'}</span>
    </div>
);

// Di dalam komponen App, modifikasi PendingItemsView

const PendingItemsView = ({ items, title }) => {
    if (!items || items.length === 0) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-xl text-center">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">{title}</h2>
                <Info size={48} className="mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 text-lg">Tidak ada data {title.toLowerCase()} yang tertunda saat ini.</p>
            </div>
        );
    }
    // Urutkan item berdasarkan status SLA, kemudian tanggal diterima (terbaru dulu)
    const sortedItems = [...items].sort((a, b) => {
        const statusA = getSlaStatusInfo(a.sla).sortOrder;
        const statusB = getSlaStatusInfo(b.sla).sortOrder;
        if (statusA !== statusB) return statusA - statusB;
        return (b.dateReceived?.toDate() || 0) - (a.dateReceived?.toDate() || 0);
    });

    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-xl">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6 pb-4 border-b border-gray-200">{title}</h2>

            {/* --- Tampilan Tabel untuk Layar Medium ke Atas (md+) --- */}
            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            {['No', 'Bulan', 'No. Surat', 'Asal', 'Tgl Terima', 'Tgl Surat', 'Pembuat', 'Tujuan', 'Perihal', 'SLA'].map(header => (
                                <th key={header} scope="col" className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {sortedItems.map((item, index) => {
                            const slaInfo = getSlaStatusInfo(item.sla);
                            return (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-3 py-3.5 whitespace-nowrap text-sm text-gray-700">{index + 1}</td>
                                    <td className="px-3 py-3.5 whitespace-nowrap text-sm text-gray-700">{item.month}</td>
                                    <td className="px-3 py-3.5 whitespace-nowrap text-sm text-gray-700">{item.letterNumber}</td>
                                    <td className="px-3 py-3.5 whitespace-nowrap text-sm text-gray-700">{item.origin}</td>
                                    <td className="px-3 py-3.5 whitespace-nowrap text-sm text-gray-700">{item.dateReceived ? formatDate(item.dateReceived, { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</td>
                                    <td className="px-3 py-3.5 whitespace-nowrap text-sm text-gray-700">{item.letterDate ? formatDate(item.letterDate, { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</td>
                                    <td className="px-3 py-3.5 whitespace-nowrap text-sm text-gray-700">{item.creator}</td>
                                    <td className="px-3 py-3.5 whitespace-nowrap text-sm text-gray-700">{item.destination}</td>
                                    <td className="px-3 py-3.5 text-sm text-gray-700 max-w-xs" title={item.subject}>{item.subject}</td> {/* Dibiarkan bisa wrap, atau tambahkan 'truncate' jika ingin pemotongan */}
                                    <td className="px-3 py-3.5 whitespace-nowrap text-sm">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${slaInfo.colorClass}`}>
                                            {slaInfo.Icon && <slaInfo.Icon className="w-3 h-3 mr-1" />}
                                            {slaInfo.text}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* --- Tampilan Kartu untuk Layar Kecil (di bawah md) --- */}
            <div className="md:hidden space-y-4">
                {sortedItems.map((item, index) => {
                    const slaInfo = getSlaStatusInfo(item.sla);
                    return (
                        <div key={`${item.id}-card`} className="bg-slate-50 p-3.5 border border-slate-200 rounded-lg shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="text-sm font-semibold text-blue-700 break-words flex-grow mr-2">
                                    <span className="text-gray-500 font-normal">{index + 1}. </span>
                                    {item.subject || "Tanpa Perihal"}
                                </h3>
                                <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${slaInfo.colorClass}`}>
                                    {slaInfo.Icon && <slaInfo.Icon className="w-3 h-3 mr-1" />}
                                    {slaInfo.text}
                                </span>
                            </div>
                            
                            <div className="space-y-1">
                                <DataItem label="No. Surat" value={item.letterNumber} />
                                <DataItem label="Asal Surat" value={item.origin} />
                                <DataItem label="Bulan" value={item.month} />
                                <DataItem label="Tgl Diterima" value={item.dateReceived ? formatDate(item.dateReceived, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'} />
                                <DataItem label="Tgl Surat" value={item.letterDate ? formatDate(item.letterDate, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'} />
                                <DataItem label="Pembuat" value={item.creator} />
                                <DataItem label="Tujuan" value={item.destination} />
                                {/* Perihal sudah di judul kartu, jadi opsional di sini */}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- Admin Components ---
const AdminLogin = ({ setCurrentPage, setCurrentUser, setUserId, showSuccess, showError }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoggingIn(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            setCurrentUser(userCredential.user);
            setUserId(userCredential.user.uid);
            setCurrentPage('ADMIN_MANAGE_SCHEDULE'); // Redirect to admin dashboard or manage schedule
            showSuccess('Login berhasil! Selamat datang, Admin.');
        } catch (error) {
            console.error("Login error:", error);
            showError(`Login gagal: ${error.message}`);
        } finally {
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="flex items-center justify-center py-12">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md">
                <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">Login Admin</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="admin@bpkh.go.id"
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="********"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoggingIn}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 transition duration-150"
                    >
                        {isLoggingIn ? 'Memproses...' : 'Login'}
                    </button>
                </form>
            </div>
        </div>
    );
};

const AdminManageSchedule = ({ schedules, participants, dbPath, showSuccess, showError }) => {
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        endTime: '10:00',
        agenda: '',
        participants: [],
        location: '',
        locationLink: '',
        notes: '',
        uploadedFiles: [{ name: '', url: '' }] // Default dengan satu entri kosong
    });
    const [editingId, setEditingId] = useState(null); // null for new, ID for editing
    const [isSubmitting, setIsSubmitting] = useState(false);

    const schedulesCollectionPath = dbPath('schedules');

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleMaterialInputChange = (index, event) => {
    const { name, value } = event.target;
    const newUploadedFiles = formData.uploadedFiles.map((file, i) => {
        if (index === i) {
            return { ...file, [name]: value };
        }
        return file;
    });
    setFormData(prev => ({ ...prev, uploadedFiles: newUploadedFiles }));
};

const addMaterialField = () => {
    setFormData(prev => ({
        ...prev,
        uploadedFiles: [...prev.uploadedFiles, { name: '', url: '' }]
    }));
};

const removeMaterialField = (index) => {
    // Jangan hapus jika hanya ada satu field tersisa, atau buat field default jika semua dihapus
    if (formData.uploadedFiles.length <= 1) {
        // Set field menjadi kosong jika hanya satu dan ingin "dihapus"
        setFormData(prev => ({
            ...prev,
            uploadedFiles: [{ name: '', url: '' }]
        }));
        return;
    }
    const newUploadedFiles = formData.uploadedFiles.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, uploadedFiles: newUploadedFiles }));
};

    const handleParticipantChange = (e) => {
        const { value, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            participants: checked 
                ? [...prev.participants, value] 
                : prev.participants.filter(p => p !== value)
        }));
    };

    const resetForm = () => {
        setFormData({
            date: new Date().toISOString().split('T')[0],
            startTime: '09:00',
            endTime: '10:00',
            agenda: '',
            participants: [],
            location: '',
            locationLink: '',
            notes: '',
            uploadedFiles: [{ name: '', url: '' }] // Reset ke satu entri kosong
        });
        setEditingId(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!schedulesCollectionPath) {
            showError("Database path not available. Cannot save schedule.");
            return;
        }
         setIsSubmitting(true);
        
         const filledUploadedFiles = formData.uploadedFiles.filter(
            file => (file.name && file.name.trim() !== '') || (file.url && file.url.trim() !== '')
         );

        const scheduleData = {
            ...formData,
            date: formData.date, // Using YYYY-MM-DD string
            //uploadedFiles: formData.uploadedFilesText.split(',').map(name => name.trim()).filter(name => name).map(name => ({name, url: '#'})) // Simulated
            uploadedFiles: filledUploadedFiles // Gunakan array yang sudah difilter
        };

        try {
            if (editingId) {
                const docRef = doc(db, schedulesCollectionPath, editingId);
                await setDoc(docRef, scheduleData, { merge: true });
                showSuccess('Jadwal berhasil diperbarui.');
            } else {
                await addDoc(collection(db, schedulesCollectionPath), scheduleData);
                showSuccess('Jadwal baru berhasil ditambahkan.');
            }
            resetForm();
        } catch (error) {
            console.error("Error saving schedule:", error);
            showError(`Gagal menyimpan jadwal: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleEdit = (schedule) => {
        setEditingId(schedule.id);
        setFormData({
            date: schedule.date instanceof Timestamp ? schedule.date.toDate().toISOString().split('T')[0] : schedule.date,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            agenda: schedule.agenda,
            participants: schedule.participants || [],
            location: schedule.location,
            locationLink: schedule.locationLink || '',
            notes: schedule.notes || '',
            // UBAH BAGIAN INI:
            // uploadedFilesText: (schedule.uploadedFiles || []).map(f => f.name).join(', ')
            uploadedFiles: (schedule.uploadedFiles && schedule.uploadedFiles.length > 0) ? schedule.uploadedFiles : [{ name: '', url: '' }]
        });
        window.scrollTo(0,0); // Scroll to top to see form
    };

    const handleDelete = async (id) => {
        if (!schedulesCollectionPath) {
            showError("Database path not available. Cannot delete schedule.");
            return;
        }
        if (window.confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) { // Standard confirm, replace with custom modal if needed
            try {
                await deleteDoc(doc(db, schedulesCollectionPath, id));
                showSuccess('Jadwal berhasil dihapus.');
            } catch (error) {
                console.error("Error deleting schedule:", error);
                showError(`Gagal menghapus jadwal: ${error.message}`);
            }
        }
    };


    return (
        <div className="bg-white p-6 rounded-xl shadow-xl space-y-8">
            <h2 className="text-3xl font-bold text-gray-800 border-b pb-4">{editingId ? 'Edit Jadwal Kegiatan' : 'Tambah Jadwal Kegiatan Baru'}</h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="date" className="block text-sm font-medium text-gray-700">Tanggal</label>
                        <input type="date" name="date" id="date" value={formData.date} onChange={handleInputChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="startTime" className="block text-sm font-medium text-gray-700">Waktu Mulai</label>
                            <input type="time" name="startTime" id="startTime" value={formData.startTime} onChange={handleInputChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                        </div>
                        <div>
                            <label htmlFor="endTime" className="block text-sm font-medium text-gray-700">Waktu Selesai</label>
                            <input type="time" name="endTime" id="endTime" value={formData.endTime} onChange={handleInputChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                        </div>
                    </div>
                </div>

                <div>
                    <label htmlFor="agenda" className="block text-sm font-medium text-gray-700">Agenda</label>
                    <input type="text" name="agenda" id="agenda" value={formData.agenda} onChange={handleInputChange} required placeholder="Judul agenda kegiatan" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Peserta</label>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                        {participants.length > 0 ? participants.map(p => (
                            <div key={p.id} className="flex items-center">
                                <input 
                                    type="checkbox" 
                                    id={`participant-${p.id}`} 
                                    value={p.name} 
                                    checked={formData.participants.includes(p.name)}
                                    onChange={handleParticipantChange}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <label htmlFor={`participant-${p.id}`} className="ml-2 text-sm text-gray-700">{p.name}</label>
                            </div>
                        )) : <p className="text-sm text-gray-500 col-span-full">Belum ada data peserta. Silakan tambahkan di 'Kelola Peserta'.</p>}
                    </div>
                </div>
                
                <div>
                    <label htmlFor="location" className="block text-sm font-medium text-gray-700">Lokasi</label>
                    <input type="text" name="location" id="location" value={formData.location} onChange={handleInputChange} required placeholder="Tempat pelaksanaan" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                </div>

                <div>
                    <label htmlFor="locationLink" className="block text-sm font-medium text-gray-700">Link Lokasi (Opsional)</label>
                    <input type="url" name="locationLink" id="locationLink" value={formData.locationLink} onChange={handleInputChange} placeholder="https://maps.google.com/..." className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                </div>
                
                <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Keterangan (Opsional)</label>
                    <textarea name="notes" id="notes" value={formData.notes} onChange={handleInputChange} rows="3" placeholder="Nomor undangan, detail tambahan, dll." className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"></textarea>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Materi Pendukung (Nama & Link Opsional)</label>
                    {formData.uploadedFiles.map((material, index) => (
                        <div key={index} className="p-3 mb-3 border rounded-md bg-slate-50 space-y-2">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    name="name"
                                    value={material.name}
                                    onChange={(e) => handleMaterialInputChange(index, e)}
                                    placeholder={`Nama Materi ${index + 1}`}
                                    className="block w-1/2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                                <input
                                    type="url" // Gunakan type="url" untuk validasi dasar link
                                    name="url"
                                    value={material.url}
                                    onChange={(e) => handleMaterialInputChange(index, e)}
                                    placeholder={`Link Materi ${index + 1} (http://...)`}
                                    className="block w-1/2 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                />
                                {formData.uploadedFiles.length > 0 && ( // Tombol hapus hanya jika ada lebih dari 0, atau selalu tampilkan dan handle jika satu-satunya.
                                    <button
                                        type="button"
                                        onClick={() => removeMaterialField(index)}
                                        className="p-2 text-red-500 hover:text-red-700"
                                        title="Hapus Materi Ini"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={addMaterialField}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium py-1 px-3 border border-blue-500 rounded-md hover:bg-blue-50 flex items-center"
                    >
                        <PlusCircle size={16} className="mr-1" /> Tambah Materi Lain
                    </button>
                </div>

                <div className="flex items-center space-x-4 pt-4">
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg shadow transition duration-150 ease-in-out flex items-center disabled:bg-gray-400"
                    >
                        <PlusCircle size={18} className="mr-2"/> {editingId ? 'Simpan Perubahan' : 'Tambah Jadwal'}
                    </button>
                    {editingId && (
                         <button 
                            type="button" 
                            onClick={resetForm}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-6 rounded-lg shadow transition duration-150 ease-in-out"
                        >
                            Batal Edit
                        </button>
                    )}
                </div>
            </form>

            <div className="mt-12">
                <h3 className="text-2xl font-semibold text-gray-700 mb-4">Daftar Jadwal Tersimpan</h3>
                {schedules.length === 0 ? <p className="text-gray-500">Belum ada jadwal yang ditambahkan.</p> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Waktu</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Agenda</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                            {schedules.sort((a,b) => (a.date > b.date ? -1 : 1) || a.startTime.localeCompare(b.startTime)).slice(0,10).map(s => ( // Show recent 10
                                <tr key={s.id}>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm">{s.date instanceof Timestamp ? formatDate(s.date.toDate()) : formatDate(new Date(s.date))}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm">{formatTime(s.startTime)} - {formatTime(s.endTime)}</td>
                                    <td className="px-3 py-2 text-sm max-w-xs truncate" title={s.agenda}>{s.agenda}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm space-x-2">
                                        <button onClick={() => handleEdit(s)} className="text-blue-600 hover:text-blue-800"><Edit3 size={18}/></button>
                                        <button onClick={() => handleDelete(s.id)} className="text-red-600 hover:text-red-800"><Trash2 size={18}/></button>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                        {schedules.length > 10 && <p className="text-xs text-gray-500 mt-2">Menampilkan 10 jadwal terbaru. Data lengkap tersedia di halaman publik.</p>}
                    </div>
                )}
            </div>
        </div>
    );
};


const AdminManageHolidays = ({ holidays, dbPath, showSuccess, showError }) => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [holidayName, setHolidayName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const holidaysCollectionPath = dbPath('holidays');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!holidaysCollectionPath) {
            showError("Database path not available.");
            return;
        }
        setIsSubmitting(true);
        try {
            // Document ID is the date string 'YYYY-MM-DD'
            await setDoc(doc(db, holidaysCollectionPath, date), { name: holidayName || 'Hari Libur Ditetapkan' });
            showSuccess(`Tanggal ${date} ditetapkan sebagai hari libur: ${holidayName}.`);
            setDate(new Date().toISOString().split('T')[0]);
            setHolidayName('');
        } catch (error) {
            console.error("Error setting holiday:", error);
            showError(`Gagal menetapkan hari libur: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (holidayDate) => {
        if (!holidaysCollectionPath) {
            showError("Database path not available.");
            return;
        }
        if (window.confirm(`Apakah Anda yakin ingin menghapus status libur untuk tanggal ${holidayDate}?`)) { // Standard confirm
            try {
                await deleteDoc(doc(db, holidaysCollectionPath, holidayDate));
                showSuccess(`Status libur untuk tanggal ${holidayDate} berhasil dihapus.`);
            } catch (error) {
                console.error("Error deleting holiday:", error);
                showError(`Gagal menghapus status libur: ${error.message}`);
            }
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-xl space-y-8">
            <h2 className="text-3xl font-bold text-gray-800 border-b pb-4">Kelola Hari Libur</h2>
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
                <div>
                    <label htmlFor="holidayDate" className="block text-sm font-medium text-gray-700">Pilih Tanggal</label>
                    <input 
                        type="date" 
                        id="holidayDate" 
                        value={date} 
                        onChange={(e) => setDate(e.target.value)} 
                        required 
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                </div>
                 <div>
                    <label htmlFor="holidayName" className="block text-sm font-medium text-gray-700">Nama Hari Libur (Opsional)</label>
                    <input 
                        type="text" 
                        id="holidayName" 
                        value={holidayName} 
                        onChange={(e) => setHolidayName(e.target.value)} 
                        placeholder="Cth: Cuti Bersama Idul Fitri"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                </div>
                <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-150 flex items-center disabled:bg-gray-400"
                >
                    <Sun size={18} className="mr-2" /> Tetapkan Sebagai Hari Libur
                </button>
            </form>

            <div className="mt-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-3">Daftar Hari Libur Ditetapkan</h3>
                {Object.keys(holidays).length === 0 ? (
                    <p className="text-gray-500">Belum ada hari libur yang ditetapkan.</p>
                ) : (
                    <ul className="space-y-2">
                        {Object.entries(holidays).sort(([dateA], [dateB]) => dateA.localeCompare(dateB)).map(([holidayDate, holidayData]) => (
                            <li key={holidayDate} className="flex justify-between items-center p-3 bg-yellow-50 rounded-md shadow-sm">
                                <span>{formatDate(new Date(holidayDate))} - <span className="font-medium">{holidayData.name || 'Hari Libur'}</span></span>
                                <button onClick={() => handleDelete(holidayDate)} className="text-red-500 hover:text-red-700">
                                    <Trash2 size={18} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

const AdminManagePendingItems = ({ pendingItems, dbPath, showSuccess, showError }) => {
    const currentMonthName = MONTHS[new Date().getMonth()]; // Dapatkan nama bulan saat ini
    const initialFormState = {
        type: 'letter',
        month: currentMonthName,
        letterNumber: '',
        origin: '',
        dateReceived: new Date().toISOString().split('T')[0],
        letterDate: new Date().toISOString().split('T')[0],
        creator: '',
        destination: '',
        subject: '',
        sla: '' // Default SLA menjadi string kosong (opsional)
    };
    const [formData, setFormData] = useState(initialFormState);
    const [editingId, setEditingId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const itemsCollectionPath = dbPath('pendingItems');

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const resetForm = () => {
        setFormData(initialFormState);
        setEditingId(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!itemsCollectionPath) {
            showError("Database path not available.");
            return;
        }
        setIsSubmitting(true);
        const itemData = {
            ...formData,
            dateReceived: formData.dateReceived ? Timestamp.fromDate(new Date(formData.dateReceived)) : null,
            letterDate: formData.letterDate ? Timestamp.fromDate(new Date(formData.letterDate)) : null,
            sla: formData.sla ? Timestamp.fromDate(new Date(formData.sla)) : null, // Simpan null jika formData.sla kosong
        };

        try {
            if (editingId) {
                await setDoc(doc(db, itemsCollectionPath, editingId), itemData, { merge: true });
                showSuccess('Item berhasil diperbarui.');
            } else {
                await addDoc(collection(db, itemsCollectionPath), itemData);
                showSuccess('Item baru berhasil ditambahkan.');
            }
            resetForm();
        } catch (error) {
            console.error("Error saving item:", error);
            showError(`Gagal menyimpan item: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (item) => {
        setEditingId(item.id);
        setFormData({
            type: item.type,
            month: item.month,
            letterNumber: item.letterNumber,
            origin: item.origin,
            dateReceived: item.dateReceived?.toDate().toISOString().split('T')[0] || '',
            letterDate: item.letterDate?.toDate().toISOString().split('T')[0] || '',
            creator: item.creator,
            destination: item.destination,
            subject: item.subject,
            sla: item.sla?.toDate().toISOString().split('T')[0] || '', // Jika item.sla null, set form sla ke string kosong
        });
        window.scrollTo(0,0);
    };

    const handleDelete = async (id) => {
        // ... (fungsi handleDelete tetap sama) ...
        if (!itemsCollectionPath) {
            showError("Database path not available.");
            return;
        }
        if (window.confirm('Apakah Anda yakin ingin menghapus item ini?')) { // Standard confirm
            try {
                await deleteDoc(doc(db, itemsCollectionPath, id));
                showSuccess('Item berhasil dihapus.');
            } catch (error) {
                console.error("Error deleting item:", error);
                showError(`Gagal menghapus item: ${error.message}`);
            }
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-xl space-y-8">
            <h2 className="text-3xl font-bold text-gray-800 border-b pb-4">{editingId ? 'Edit Pending Item' : 'Tambah Pending Item Baru'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="type" className="block text-sm font-medium text-gray-700">Jenis</label>
                        <select name="type" id="type" value={formData.type} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                            <option value="letter">Surat</option>
                            <option value="proposal">Proposal</option>
                        </select>
                    </div>
                    <div> {/* UBAH INPUT BULAN MENJADI DROPDOWN */}
                        <label htmlFor="month" className="block text-sm font-medium text-gray-700">Bulan</label>
                        <select 
                            name="month" 
                            id="month" 
                            value={formData.month} 
                            onChange={handleInputChange} 
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        >
                            {MONTHS.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="letterNumber" className="block text-sm font-medium text-gray-700">No. Surat</label>
                        <input type="text" name="letterNumber" id="letterNumber" value={formData.letterNumber} onChange={handleInputChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                    </div>
                    <div>
                        <label htmlFor="origin" className="block text-sm font-medium text-gray-700">Asal Surat</label>
                        <input type="text" name="origin" id="origin" value={formData.origin} onChange={handleInputChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                    </div>
                    <div>
                        <label htmlFor="dateReceived" className="block text-sm font-medium text-gray-700">Tanggal Diterima</label>
                        <input type="date" name="dateReceived" id="dateReceived" value={formData.dateReceived} onChange={handleInputChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                    </div>
                    <div>
                        <label htmlFor="letterDate" className="block text-sm font-medium text-gray-700">Tanggal Surat</label>
                        <input type="date" name="letterDate" id="letterDate" value={formData.letterDate} onChange={handleInputChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                    </div>
                    <div>
                        <label htmlFor="creator" className="block text-sm font-medium text-gray-700">Pembuat</label>
                        <input type="text" name="creator" id="creator" value={formData.creator} onChange={handleInputChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                    </div>
                    <div>
                        <label htmlFor="destination" className="block text-sm font-medium text-gray-700">Tujuan</label>
                        <input type="text" name="destination" id="destination" value={formData.destination} onChange={handleInputChange} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"/>
                    </div>
                    <div className="lg:col-span-1"> {/* UBAH INPUT SLA MENJADI DATE PICKER */}
                        <label htmlFor="sla" className="block text-sm font-medium text-gray-700">Tanggal SLA</label>
                        <input 
                            type="date" 
                            name="sla" 
                            id="sla" 
                            value={formData.sla} 
                            onChange={handleInputChange} 
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                    </div>
                    <div className="md:col-span-2 lg:col-span-3">
                        <label htmlFor="subject" className="block text-sm font-medium text-gray-700">Perihal</label>
                        <textarea name="subject" id="subject" value={formData.subject} onChange={handleInputChange} required rows="2" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"></textarea>
                    </div>
                </div>
                <div className="flex items-center space-x-4 pt-4">
                     <button type="submit" disabled={isSubmitting} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-150 flex items-center disabled:bg-gray-400">
                        <PlusCircle size={18} className="mr-2"/> {editingId ? 'Simpan Item' : 'Tambah Item'}
                    </button>
                    {editingId && <button type="button" onClick={resetForm} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow">Batal Edit</button>}
                </div>
            </form>

            <div className="mt-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-3">Daftar Pending Items</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                {['Jenis', 'No. Surat', 'Perihal', 'Tgl Diterima', 'SLA', 'Aksi'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                        {pendingItems.sort((a, b) => { // Sortir berdasarkan status SLA, lalu tanggal diterima
                            const statusA = getSlaStatusInfo(a.sla).sortOrder;
                            const statusB = getSlaStatusInfo(b.sla).sortOrder;
                            if (statusA !== statusB) return statusA - statusB;
                            return (b.dateReceived?.toDate() || 0) - (a.dateReceived?.toDate() || 0); // Terbaru dulu
                        }).map(item => {
                            const slaInfo = getSlaStatusInfo(item.sla);
                            return (
                            <tr key={item.id}>
                                <td className="px-3 py-2 whitespace-nowrap text-sm capitalize">{item.type}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm">{item.letterNumber}</td>
                                <td className="px-3 py-2 text-sm max-w-xs truncate" title={item.subject}>{item.subject}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm">{item.dateReceived ? formatDate(item.dateReceived) : '-'}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${slaInfo.colorClass}`}>
                                        {slaInfo.Icon && <slaInfo.Icon className="w-3 h-3 mr-1.5" />}
                                        {slaInfo.text}
                                    </span>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm space-x-2">
                                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800"><Edit3 size={18}/></button>
                                    <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800"><Trash2 size={18}/></button>
                                </td>
                            </tr>
                        )})}
                        </tbody>
                    </table>
                </div>
                {pendingItems.length === 0 && <p className="text-gray-500">Belum ada item.</p>}
            </div>
        </div>
    );
};

const AdminManageParticipants = ({ participants, dbPath, showSuccess, showError }) => {
    const [name, setName] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const participantsCollectionPath = dbPath('participants');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!participantsCollectionPath) {
            showError("Database path not available.");
            return;
        }
        setIsSubmitting(true);
        try {
            if (editingId) {
                await setDoc(doc(db, participantsCollectionPath, editingId), { name }, { merge: true });
                showSuccess('Nama peserta berhasil diperbarui.');
            } else {
                await addDoc(collection(db, participantsCollectionPath), { name });
                showSuccess('Peserta baru berhasil ditambahkan.');
            }
            setName('');
            setEditingId(null);
        } catch (error) {
            console.error("Error saving participant:", error);
            showError(`Gagal menyimpan peserta: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (participant) => {
        setName(participant.name);
        setEditingId(participant.id);
    };
    
    const handleDelete = async (id) => {
        if (!participantsCollectionPath) {
            showError("Database path not available.");
            return;
        }
        if (window.confirm('Apakah Anda yakin ingin menghapus peserta ini?')) { // Standard confirm
            try {
                await deleteDoc(doc(db, participantsCollectionPath, id));
                showSuccess('Peserta berhasil dihapus.');
                if (editingId === id) { // If deleting the one being edited, reset form
                    setName('');
                    setEditingId(null);
                }
            } catch (error) {
                console.error("Error deleting participant:", error);
                showError(`Gagal menghapus peserta: ${error.message}`);
            }
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-xl space-y-8">
            <h2 className="text-3xl font-bold text-gray-800 border-b pb-4">Kelola Peserta/Pegawai</h2>
            <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                <div>
                    <label htmlFor="participantName" className="block text-sm font-medium text-gray-700">Nama Peserta/Pegawai</label>
                    <input 
                        type="text" 
                        id="participantName" 
                        value={name} 
                        onChange={(e) => setName(e.target.value)} 
                        required 
                        placeholder="Masukkan nama lengkap"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                </div>
                <div className="flex items-center space-x-3">
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-150 flex items-center disabled:bg-gray-400"
                    >
                        <Users size={18} className="mr-2"/> {editingId ? 'Simpan Perubahan' : 'Tambah Peserta'}
                    </button>
                    {editingId && <button type="button" onClick={() => { setName(''); setEditingId(null);}} className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow">Batal Edit</button>}
                </div>
            </form>

            <div className="mt-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-3">Daftar Peserta/Pegawai</h3>
                {participants.length === 0 ? (
                    <p className="text-gray-500">Belum ada peserta yang ditambahkan.</p>
                ) : (
                    <ul className="space-y-2 max-w-lg">
                        {participants.map((p) => (
                            <li key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-md shadow-sm">
                                <span className="text-gray-800">{p.name}</span>
                                <div className="space-x-2">
                                    <button onClick={() => handleEdit(p)} className="text-blue-500 hover:text-blue-700"><Edit3 size={18}/></button>
                                    <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:text-red-700"><Trash2 size={18}/></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

const AdminWhatsAppShare = ({ selectedDate, getDailySchedule, getWeekRange, pendingLetters, pendingProposals, isHoliday, showSuccess, showError }) => {
    const [messageType, setMessageType] = useState('daily'); // 'daily', 'weekly', 'letters', 'proposals'
    const [generatedMessage, setGeneratedMessage] = useState('');
    const [whatsAppNumber, setWhatsAppNumber] = useState(''); // Could be fetched or pre-filled

    const generateMessageContent = useCallback(() => {
        let content = `*INFORMASI JADWAL DEWAN PENGAWAS BPKH*\n=============================\n\n`;
        
        if (messageType === 'daily') {
            const schedule = getDailySchedule(selectedDate);
            const holidayInfo = isHoliday(selectedDate);
            content += `*Jadwal Harian - ${getDayName(selectedDate)}, ${formatDate(selectedDate)}*\n`;
            if (holidayInfo) {
                content += `*HARI LIBUR: ${holidayInfo.name || 'Hari Libur Nasional/Cuti Bersama'}*\n\n`;
            }
            if (schedule.length > 0) {
                schedule.forEach(item => {
                    content += `*${formatTime(item.startTime)} - ${formatTime(item.endTime)}*\n`;
                    content += `Agenda: ${item.agenda}\n`;
                    content += `Lokasi: ${item.location}\n`;
                    content += `Peserta: ${Array.isArray(item.participants) ? item.participants.join(', ') : item.participants}\n`;
                    if(item.notes) content += `Ket: ${item.notes}\n`;
                    content += `-----------------------------\n`;
                });
            } else if (!holidayInfo) {
                content += `Tidak ada agenda terjadwal.\n`;
            }
        } else if (messageType === 'weekly') {
            const weekDates = getWeekRange(selectedDate);
            content += `*Agenda Pekanan Tentatif (Minggu Ini)*\n`;
            weekDates.forEach(date => {
                content += `\n*${getDayName(date)}, ${formatDate(date, {day:'numeric', month:'short'})}*\n`;
                const dailySchedule = getDailySchedule(date);
                 const holidayInfo = isHoliday(date);
                if (holidayInfo) {
                    content += `*HARI LIBUR: ${holidayInfo.name || ''}*\n`;
                }
                if (dailySchedule.length > 0) {
                    dailySchedule.forEach(item => {
                        content += `- ${formatTime(item.startTime)}: ${item.agenda}\n`;
                    });
                } else if (!holidayInfo) {
                    content += `_Tidak ada agenda._\n`;
                }
            });
        } else if (messageType === 'letters' || messageType === 'proposals') {
            const items = messageType === 'letters' ? pendingLetters : pendingProposals;
            const title = messageType === 'letters' ? 'Pending Surat' : 'Pending Proposal';
            content += `*${title}*\n`;
            if (items.length > 0) {
                items.forEach((item, index) => {
                    content += `${index + 1}. *No. Surat:* ${item.letterNumber}\n`;
                    content += `   Perihal: ${item.subject}\n`;
                    content += `   Asal: ${item.origin}\n`;
                    content += `   Tgl Diterima: ${formatDate(item.dateReceived)}\n`;
                    content += `   SLA: ${item.sla}\n`;
                    content += `-----------------------------\n`;
                });
            } else {
                content += `Tidak ada data ${title.toLowerCase()} yang tertunda.\n`;
            }
        }
        setGeneratedMessage(content);
    }, [messageType, selectedDate, getDailySchedule, getWeekRange, pendingLetters, pendingProposals, isHoliday, getDayName, formatDate, formatTime]); // Added dependencies

    useEffect(() => { // Call generateMessageContent when dependencies change
        generateMessageContent();
    }, [generateMessageContent]);


    const handleCopyToClipboard = () => {
        const textArea = document.createElement("textarea");
        textArea.value = generatedMessage;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy'); 
            showSuccess('Pesan berhasil disalin ke clipboard!');
        } catch (err) {
            navigator.clipboard.writeText(generatedMessage).then(() => {
                 showSuccess('Pesan berhasil disalin ke clipboard!');
            }).catch(clipboardErr => {
                console.error('Gagal menyalin:', clipboardErr);
                showError('Gagal menyalin pesan. Silakan salin manual.');
            });
        }
        document.body.removeChild(textArea);
    };
    
    const handleSendToWhatsApp = () => {
        if (!whatsAppNumber) {
            showError("Mohon masukkan nomor WhatsApp tujuan.");
            return;
        }
        const encodedMessage = encodeURIComponent(generatedMessage);
        let formattedNumber = whatsAppNumber.replace(/\D/g, ''); 
        if (formattedNumber.startsWith('0')) {
            formattedNumber = '62' + formattedNumber.substring(1);
        }
        
        const whatsappUrl = `https://wa.me/${formattedNumber}?text=${encodedMessage}`;
        window.open(whatsappUrl, '_blank');
    };


    return (
        <div className="bg-white p-6 rounded-xl shadow-xl space-y-6">
            <h2 className="text-3xl font-bold text-gray-800 border-b pb-4">Kirim Notifikasi via WhatsApp</h2>
            
            <div>
                <label htmlFor="messageType" className="block text-sm font-medium text-gray-700">Pilih Jenis Informasi:</label>
                <select 
                    id="messageType" 
                    value={messageType} 
                    onChange={(e) => setMessageType(e.target.value)}
                    className="mt-1 block w-full max-w-md rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                    <option value="daily">Jadwal Harian ({formatDate(selectedDate, {day:'numeric', month:'short'})})</option>
                    <option value="weekly">Agenda Pekanan</option>
                    <option value="letters">Pending Surat</option>
                    <option value="proposals">Pending Proposal</option>
                </select>
            </div>

            <div>
                <label htmlFor="generatedMessage" className="block text-sm font-medium text-gray-700">Pesan yang Akan Dikirim:</label>
                <textarea 
                    id="generatedMessage" 
                    rows="10" 
                    readOnly 
                    value={generatedMessage}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm bg-gray-50 p-3 font-mono text-sm"
                ></textarea>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-3">
                <button 
                    onClick={handleCopyToClipboard}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-150 flex items-center justify-center"
                >
                    <Paperclip size={18} className="mr-2" /> Salin Pesan
                </button>
                <div className="w-full sm:w-auto flex items-center space-x-2">
                     <input 
                        type="tel" 
                        value={whatsAppNumber}
                        onChange={(e) => setWhatsAppNumber(e.target.value)}
                        placeholder="No. WhatsApp (cth: 62812xxxx)"
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                    <button 
                        onClick={handleSendToWhatsApp}
                        className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-150 flex items-center"
                        title="Buka WhatsApp Web/Desktop dengan pesan terisi"
                    >
                        <Send size={18} className="mr-2" /> Kirim
                    </button>
                </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Fitur "Kirim" akan membuka WhatsApp Web/Desktop. Pastikan Anda telah login.</p>
        </div>
    );
};


export default App;