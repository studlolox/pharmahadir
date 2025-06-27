/* global __firebase_config, __app_id, __initial_auth_token, XLSX, QRCode */
/*
  ==================================================================================
  ===> LANGKAH WAJIB: KEMAS KINI PERATURAN KESELAMATAN FIREBASE <===
  ==================================================================================
  Ralat "permission-denied" yang anda lihat berlaku kerana peraturan keselamatan
  (security rules) di pangkalan data Firebase anda perlu dikemas kini. Tanpa
  langkah ini, aplikasi tidak akan berfungsi.

  1. Pergi ke Firebase Console anda.
  2. Pilih projek ini.
  3. Pergi ke Firestore Database > tab "Rules".
  4. Gantikan SEMUA teks di sana dengan kod di bawah:
  ==================================================================================

  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      // Benarkan sesiapa sahaja membaca dan menulis ke koleksi data awam
      match /artifacts/{appId}/public/data/{document=**} {
        allow read, write: if true;
      }
    }
  }

  ==================================================================================
*/
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    getDoc,
    setDoc,
    serverTimestamp,
    writeBatch
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { Settings, Send, UserPlus, Trash2, Edit3, Link2, ThumbsUp, ThumbsDown, CheckCircle, Users, Printer, FileDown, Calendar, MapPin, UploadCloud, X, RefreshCw, AlertCircle, QrCode, Info, Search } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG);
const appId = process.env.REACT_APP_APP_ID;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Default Event Details ---
const defaultEventDetails = {
    eventName: "Sambutan Hari Farmasi Sedunia Peringkat Negeri Kelantan 2025",
    date: "2025-09-22",
    location: "Dataran Kemahkotaan, Machang",
    theme: "Pharmacists Stepping Up",
    deadline: ""
};

// --- Main App Router ---
function App() {
    const [page, setPage] = useState('loading');

    // Effect to load external scripts for Excel and QR Code generation
    useEffect(() => {
        const scripts = [
            { id: 'xlsx-script', src: 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js' },
            { id: 'qrcode-script', src: 'https://cdn.jsdelivr.net/npm/qrcode@1.5.0/build/qrcode.min.js' }
        ];
        scripts.forEach(s => {
            if (!document.getElementById(s.id)) {
                const script = document.createElement('script');
                script.id = s.id;
                script.src = s.src;
                script.async = true;
                document.body.appendChild(script);
            }
        });
    }, []);

    // Effect to determine if the user is a guest or an admin
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('guestId')) {
            setPage('rsvp');
        } else {
            setPage('admin');
        }
    }, []);

    if (page === 'loading') return <div className="p-10 text-center">Loading...</div>;
    if (page === 'rsvp') return <PublicRsvpPage />;
    return <AdminDashboard />;
}

// --- Reusable Modal Components ---
function InfoModal({ title, message, onClose }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[100]">
            <div className="bg-white rounded-lg p-6 w-full max-w-sm relative shadow-xl text-center">
                 <Info size={32} className="mx-auto text-blue-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-slate-800">{title || "Info"}</h3>
                <p className="text-slate-600 mb-6">{message}</p>
                <button onClick={onClose} className="bg-teal-500 text-white py-2 px-6 rounded-md hover:bg-teal-600">OK</button>
            </div>
        </div>
    );
}

function ConfirmModal({ title, message, onConfirm, onCancel }) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[100]">
            <div className="bg-white rounded-lg p-6 w-full max-w-sm relative shadow-xl text-center">
                <AlertCircle size={32} className="mx-auto text-yellow-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-slate-800">{title || "Confirmation"}</h3>
                <p className="text-slate-600 mb-6">{message}</p>
                <div className="flex justify-center gap-4">
                    <button onClick={onCancel} className="py-2 px-6 bg-slate-200 rounded-md hover:bg-slate-300">Cancel</button>
                    <button onClick={onConfirm} className="py-2 px-6 bg-red-500 text-white rounded-md hover:bg-red-600">Confirm</button>
                </div>
            </div>
        </div>
    );
}


// --- Admin Dashboard Component ---
function AdminDashboard() {
    const [db, setDb] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [guests, setGuests] = useState([]);
    const [eventDetails, setEventDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isGuestFormVisible, setIsGuestFormVisible] = useState(false);
    const [isEventFormVisible, setIsEventFormVisible] = useState(false);
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [isRepFormVisible, setIsRepFormVisible] = useState(false);
    const [qrCodeGuest, setQrCodeGuest] = useState(null);
    const [currentGuest, setCurrentGuest] = useState(null);
    const [modal, setModal] = useState({ isOpen: false, type: '', message: '', title: '', onConfirm: null });
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');

    const showModal = (type, message, title = '', onConfirm = () => {}) => {
        setModal({ isOpen: true, type, message, title, onConfirm });
    };
    const closeModal = () => setModal({ isOpen: false, type: '', message: '', title: '', onConfirm: null });

    // --- Effect for Firebase Initialization and Auth ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            setDb(firestoreDb);
            const auth = getAuth(app);
            onAuthStateChanged(auth, async (user) => { 
                if (!user) { 
                    if (initialAuthToken) { 
                        await signInWithCustomToken(auth, initialAuthToken); 
                    } else { 
                        await signInAnonymously(auth); 
                    } 
                }
                setIsAuthReady(true);
            });
        } catch (e) { 
            setError("Could not connect to the database."); 
            setIsLoading(false);
        }
    }, []);
    
    // --- Effect for Data Fetching, dependent on Auth state ---
    useEffect(() => {
        if (!db || !isAuthReady) return;

        const permissionErrorMsg = "Permission Denied: Could not read from the database. Please ensure you have updated the Firestore Security Rules in your Firebase Console as per the instructions at the top of the code.";
        
        const eventDetailsDocRef = doc(db, `artifacts/${appId}/public/data/eventDetails`, 'details');
        const eventUnsubscribe = onSnapshot(eventDetailsDocRef, (doc) => {
            setError(null);
            if (doc.exists()) { setEventDetails(doc.data()); }
            else { setDoc(eventDetailsDocRef, defaultEventDetails).then(() => setEventDetails(defaultEventDetails)); }
        }, (err) => {
            console.error("Event Details Fetch Error:", err);
            if (err.code === 'permission-denied') { setError(permissionErrorMsg); }
            else { setError("An unknown error occurred while fetching event details."); }
        });

        const guestCollectionRef = collection(db, `artifacts/${appId}/public/data/guests`);
        const guestUnsubscribe = onSnapshot(guestCollectionRef, (snapshot) => {
            setError(null);
            const guestData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            guestData.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
            setGuests(guestData);
            setIsLoading(false);
        }, (err) => {
            console.error("Guests Fetch Error:", err);
            if (err.code === 'permission-denied') { setError(permissionErrorMsg); }
            else { setError("An unknown error occurred while fetching guests."); }
            setIsLoading(false);
        });

        return () => { 
            eventUnsubscribe(); 
            guestUnsubscribe(); 
        };
    }, [db, isAuthReady]);

    const filteredGuests = useMemo(() => {
        return guests.filter(guest => {
            const matchesStatus = statusFilter === 'All' || guest.rsvpStatus === statusFilter;
            const matchesSearch = !searchTerm || guest.name?.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesStatus && matchesSearch;
        });
    }, [guests, searchTerm, statusFilter]);

    const handleUpdate = useCallback(async (guestId, updatedData) => { if (!db) return; try { await updateDoc(doc(db, `artifacts/${appId}/public/data/guests`, guestId), updatedData); } catch (error) { console.error("Update failed:", error); }}, [db]);

    const handleDelete = useCallback(async (guestId) => {
        showModal('confirm', 'Anda pasti mahu memadam tetamu ini?', 'Padam Tetamu', async () => {
             if (!db) return;
             try {
                 await deleteDoc(doc(db, `artifacts/${appId}/public/data/guests`, guestId));
                 closeModal();
             } catch (error) {
                 console.error("Delete failed:", error);
                 closeModal();
                 showModal('info', 'Gagal memadam tetamu.');
             }
        });
    }, [db]);

    const handleEventFormSubmit = useCallback(async (details) => { if (!db) return; try { await setDoc(doc(db, `artifacts/${appId}/public/data/eventDetails`, 'details'), details); setIsEventFormVisible(false); } catch (err) { showModal('info', 'Gagal mengemaskini butiran acara.'); }}, [db]);

    const dashboardStats = useMemo(() => ({
        total: guests.length,
        attending: guests.filter(g => g.rsvpStatus === 'Attending').length,
        attendingWakil: guests.filter(g => g.rsvpStatus === 'Attending (Wakil)').length,
        notAttending: guests.filter(g => g.rsvpStatus === 'Not Attending').length,
        pending: guests.filter(g => g.rsvpStatus === 'Pending').length,
        invitesSent: guests.filter(g => g.invitationSent).length
    }), [guests]);

    const handleExport = useCallback(() => {
        if (typeof XLSX === 'undefined') { showModal('info', "Pustaka Excel belum dimuatkan. Sila cuba lagi."); return; }
        const dataToExport = filteredGuests.map(guest => ({
            "ID": guest.id,
            "Name": guest.name || '',
            "Designation / Organization / Affiliation": guest.organization || '',
            "Email": guest.email || '',
            "Phone": guest.phone || '',
            "Invitation Sent": guest.invitationSent ? 'Yes' : 'No',
            "RSVP Status": guest.rsvpStatus || 'Pending',
            "Representative Name": guest.representative?.name || '',
            "Representative Designation": guest.representative?.designation || '',
            "Remark": guest.remark || ''
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Guests");
        XLSX.writeFile(workbook, "Guest_List.xlsx");
    }, [filteredGuests]);

    if (isLoading) return <div className="p-10 text-center">Loading System...</div>;
    
    const filterButtons = ['All', 'Pending', 'Attending', 'Attending (Wakil)', 'Not Attending'];

    return (
        <div className="bg-slate-50 min-h-screen font-sans text-slate-800">
            {modal.isOpen && modal.type === 'info' && <InfoModal title={modal.title} message={modal.message} onClose={closeModal} />}
            {modal.isOpen && modal.type === 'confirm' && <ConfirmModal title={modal.title} message={modal.message} onConfirm={() => { modal.onConfirm(); closeModal(); }} onCancel={closeModal} />}
            {isImportModalVisible && <ImportModal db={db} onClose={() => setIsImportModalVisible(false)} showInfo={ (msg, title) => showModal('info', msg, title) } />}
            {qrCodeGuest && <QrCodeModal guest={qrCodeGuest} onClose={() => setQrCodeGuest(null)} />}
            {isEventFormVisible && <EventForm currentDetails={eventDetails} onSubmit={handleEventFormSubmit} onClose={() => setIsEventFormVisible(false)} />}
            {isGuestFormVisible && <GuestForm db={db} currentGuest={currentGuest} onComplete={() => setIsGuestFormVisible(false)} onClose={() => setIsGuestFormVisible(false)} />}
            {isRepFormVisible && <RepresentativeFormModal guest={currentGuest} onUpdate={handleUpdate} onClose={() => setIsRepFormVisible(false)} />}

            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <header className="mb-8 flex justify-between items-start">
                    <div><h1 className="text-3xl md:text-4xl font-bold text-teal-600">PharmaHadir</h1>
                    {eventDetails && <p className="text-lg text-slate-500">{eventDetails.eventName}</p>}
                    </div>
                    <button onClick={() => setIsEventFormVisible(true)} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-800 text-white font-bold py-2 px-3 rounded-lg" title="Edit Event Info"><Settings size={18} /></button>
                </header>
                {error && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
                        <p className="font-bold">PENTING: Ralat Kebenaran (Permission Error)</p>
                        <p className="mt-2">Aplikasi ini tidak dapat membaca data dari pangkalan data. Ini biasanya berlaku kerana 'Security Rules' di Firebase Console anda tidak betul.</p>
                        <p className="mt-2">Sila pastikan peraturan di Firebase anda sepadan dengan yang berikut:</p>
                        <pre className="bg-gray-200 text-black p-2 rounded mt-2 text-xs whitespace-pre-wrap">
                            {`rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /artifacts/${appId}/public/data/{document=**} {\n      allow read, write: if true;\n    }\n  }\n}`}
                        </pre>
                    </div>
                )}
                {!error && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-4 rounded-xl shadow-lg"><p className="text-sm font-light">Total Invited</p><p className="text-3xl font-bold">{dashboardStats.total}</p></div>
                            <div className="bg-gradient-to-br from-green-500 to-emerald-600 text-white p-4 rounded-xl shadow-lg"><p className="text-sm font-light">Attending</p><p className="text-3xl font-bold">{dashboardStats.attending}</p></div>
                            <div className="bg-gradient-to-br from-purple-500 to-violet-600 text-white p-4 rounded-xl shadow-lg"><p className="text-sm font-light">Attending (Wakil)</p><p className="text-3xl font-bold">{dashboardStats.attendingWakil}</p></div>
                            <div className="bg-gradient-to-br from-red-500 to-rose-600 text-white p-4 rounded-xl shadow-lg"><p className="text-sm font-light">Not Attending</p><p className="text-3xl font-bold">{dashboardStats.notAttending}</p></div>
                            <div className="bg-gradient-to-br from-yellow-500 to-amber-600 text-white p-4 rounded-xl shadow-lg"><p className="text-sm font-light">Pending</p><p className="text-3xl font-bold">{dashboardStats.pending}</p></div>
                            <div className="bg-gradient-to-br from-cyan-500 to-sky-600 text-white p-4 rounded-xl shadow-lg"><p className="text-sm font-light">Invites Sent</p><p className="text-3xl font-bold">{dashboardStats.invitesSent}</p></div>
                        </div>
                        <div className="bg-white rounded-xl shadow-md overflow-hidden">
                            <div className="p-6 space-y-4">
                                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                                    <h2 className="text-2xl font-semibold text-slate-700 w-full md:w-auto">Guest List ({filteredGuests.length})</h2>
                                    <div className="relative w-full md:w-72">
                                        <input
                                            type="text"
                                            placeholder="Search by name..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full py-2 pl-10 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        />
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        {searchTerm && (
                                            <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                <X size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                 <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium text-slate-600">Filter by Status:</span>
                                    {filterButtons.map(status => (
                                        <button 
                                            key={status} 
                                            onClick={() => setStatusFilter(status)}
                                            className={`py-1 px-3 text-sm rounded-full border transition-colors ${statusFilter === status ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-300'}`}
                                        >
                                            {status}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-3 pt-2">
                                    <button onClick={() => setIsImportModalVisible(true)} className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg"><UploadCloud size={18}/>Import</button>
                                    <button onClick={handleExport} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg"><FileDown size={18}/>Export</button>
                                    <button onClick={() => window.print()} className="flex items-center gap-2 bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg"><Printer size={18}/>Print</button>
                                    <button onClick={() => { setCurrentGuest(null); setIsGuestFormVisible(true); }} className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white font-bold py-2 px-4 rounded-lg"><UserPlus size={18}/>Add Guest</button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                {filteredGuests.length === 0 && !isLoading ? (
                                    <div className="p-10 text-center text-slate-500">
                                        <p>{searchTerm || statusFilter !== 'All' ? `No results found.` : 'No guests yet, use "Add Guest" button to start'}</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-100 text-slate-600 uppercase tracking-wider text-xs">
                                            <tr><th className="p-4">Name & Remark</th><th className="p-4">Organization</th><th className="p-4 text-center">Invite Sent?</th><th className="p-4 text-center">RSVP Status</th><th className="p-4 text-center">Actions</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredGuests.map(guest => <GuestRow key={guest.id} guest={guest} onUpdate={handleUpdate} onDelete={() => handleDelete(guest.id)} onEdit={() => { setCurrentGuest(guest); setIsGuestFormVisible(true); }} onShowQr={() => setQrCodeGuest(guest)} onShowRepForm={() => {setCurrentGuest(guest); setIsRepFormVisible(true)}} showInfoModal={ (msg, title) => showModal('info', msg, title) } />)}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// --- Public RSVP Page Component ---
function PublicRsvpPage() { 
    const [eventDetails, setEventDetails] = useState(null); 
    const [guest, setGuest] = useState(null); 
    const [isLoading, setIsLoading] = useState(true); 
    const [error, setError] = useState(null); 
    const [isDeadlinePassed, setIsDeadlinePassed] = useState(false); 
    const [view, setView] = useState('main'); 
    const [proxyDetails, setProxyDetails] = useState({ name: '', designation: '' }); 
    const [remark, setRemark] = useState(''); 
    const guestId = new URLSearchParams(window.location.search).get('guestId'); 
    const [db, setDb] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    useEffect(() => {
        if (!guestId) {
            setError("Invalid invitation link.");
            setIsLoading(false);
            return;
        }
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            setDb(firestoreDb);
            const auth = getAuth(app);
            onAuthStateChanged(auth, async (user) => {
                if (!user) {
                    await signInAnonymously(auth);
                }
                setIsAuthReady(true);
            });
        } catch (e) {
            setError("Could not initialize service.");
            setIsLoading(false);
        }
    }, [guestId]);

    useEffect(() => {
        if (!guestId || !db || !isAuthReady) return;

        const fetchAllData = async () => {
            try {
                const eventSnap = await getDoc(doc(db, `artifacts/${appId}/public/data/eventDetails`, 'details'));
                if (eventSnap.exists()) {
                    const details = eventSnap.data();
                    setEventDetails(details);
                    if (details.deadline) {
                        const deadlineDate = new Date(details.deadline);
                        deadlineDate.setHours(23, 59, 59, 999);
                        if (new Date() > deadlineDate) setIsDeadlinePassed(true);
                    }
                } else {
                    setEventDetails(defaultEventDetails);
                }
                const guestSnap = await getDoc(doc(db, `artifacts/${appId}/public/data/guests`, guestId));
                if (guestSnap.exists()) {
                    const guestData = { id: guestSnap.id, ...guestSnap.data() };
                    setGuest(guestData);
                    setRemark(guestData.remark || '');
                } else {
                    setError("Invitation not found.");
                }
            } catch (fetchError) {
                console.error("Public Page Fetch Error:", fetchError);
                if (fetchError.code === 'permission-denied') {
                    setError("Could not connect to service. The event host may need to configure database security rules.");
                } else {
                    setError("Invitation could not be loaded.");
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchAllData();
    }, [guestId, db, isAuthReady]);

    const handleRsvp = async (status, representativeData = null) => { if (isDeadlinePassed || !db) return; setView('loading'); try { await updateDoc(doc(db, `artifacts/${appId}/public/data/guests`, guest.id), { rsvpStatus: status, representative: representativeData, remark: remark, respondedAt: serverTimestamp() }); setGuest(prev => ({...prev, rsvpStatus: status, representative: representativeData, remark: remark})); setView('thankYou'); } catch (err) { setError("There was a problem submitting your response."); setView('main'); }}; 
    
    const renderRsvpButtons = () => (<div className="flex flex-col sm:flex-row justify-center gap-4"><button onClick={() => handleRsvp('Attending')} className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-lg"><ThumbsUp /> Hadir</button><button onClick={() => setView('proxyForm')} className="flex-1 flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg text-lg"><Users /> Hadir oleh Wakil</button><button onClick={() => handleRsvp('Not Attending')} className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg text-lg"><ThumbsDown /> Tidak Hadir</button></div>); 
    
    if (isLoading) {
        return <div className="bg-teal-50 min-h-screen flex items-center justify-center p-4 font-sans"><p>Loading Invitation...</p></div>;
    }

    return (
        <div className="bg-teal-50 min-h-screen flex items-center justify-center p-4 font-sans">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 sm:p-8 text-center transition-all">
                {error && <p className="text-red-500">{error}</p>}
                {!error && eventDetails && guest && (
                    <>
                        {view === 'main' ? (
                            <>
                                <div className="mb-8">
                                    <p className="text-sm uppercase tracking-widest text-teal-600 font-semibold">Anda Dijemput ke</p>
                                    <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mt-2">{eventDetails.eventName}</h1>
                                    <p className="text-lg mt-2 font-semibold text-purple-700 italic">"{eventDetails.theme}"</p>
                                </div>
                                <div className="space-y-4 text-slate-600 mb-8 text-left border-t border-b border-slate-200 py-6">
                                    <div className="flex items-center gap-4"><Calendar className="w-5 h-5 text-teal-500 flex-shrink-0" /><span className="font-medium">{eventDetails.date ? new Date(eventDetails.date).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date TBC'}</span></div>
                                    <div className="flex items-center gap-4"><MapPin className="w-5 h-5 text-teal-500 flex-shrink-0" /><span className="font-medium">{eventDetails.location}</span></div>
                                    {eventDetails.deadline && (<div className="flex items-center gap-4"><AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" /><span className="font-medium">Sila sahkan kehadiran sebelum <span className="font-bold">{new Date(eventDetails.deadline).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })}</span></span></div>)}
                                </div>
                                <p className="text-lg text-slate-600 mb-2">Jemputan Khas untuk:</p>
                                <h2 className="text-3xl font-bold text-slate-800 mb-6">{guest.name}</h2>
                                {isDeadlinePassed ? (<div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert"><p className="font-bold">Tarikh akhir RSVP telah tamat.</p></div>) : guest.rsvpStatus === 'Pending' ? (<><div className="mb-6"><textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Catatan (contoh: alahan makanan, dll.)" className="w-full p-2 border rounded-md"></textarea></div>{renderRsvpButtons()}</>) : (<div className="p-4 bg-blue-50 rounded-lg"><p className="text-slate-600 mb-4">Terima kasih, maklum balas anda telah diterima.</p><p className="text-xl font-bold text-blue-800 mb-4">Jawapan anda: {guest.rsvpStatus}</p><button onClick={() => setGuest({...guest, rsvpStatus: 'Pending'})} className="flex items-center justify-center gap-2 mx-auto bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 px-6 rounded-lg text-md"><RefreshCw size={16}/> Tukar Maklum Balas</button></div>)}
                            </>
                        ) : view === 'proxyForm' ? (
                            <form onSubmit={(e) => { e.preventDefault(); handleRsvp('Attending (Wakil)', proxyDetails);}}>
                                <h3 className="text-2xl font-bold text-slate-800 mb-4">Butiran Wakil</h3>
                                <div className="space-y-4 text-left">
                                    <input type="text" value={proxyDetails.name} onChange={(e) => setProxyDetails({...proxyDetails, name: e.target.value})} placeholder="Nama Penuh Wakil" className="w-full p-3 border rounded-md" required />
                                    <input type="text" value={proxyDetails.designation} onChange={(e) => setProxyDetails({...proxyDetails, designation: e.target.value})} placeholder="Jawatan / Designation" className="w-full p-3 border rounded-md" required />
                                </div>
                                <div className="mb-6 mt-4"><textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Catatan (contoh: alahan makanan, dll.)" className="w-full p-2 border rounded-md"></textarea></div>
                                <div className="flex gap-4 mt-6">
                                    <button type="button" onClick={() => setView('main')} className="w-full py-3 px-6 bg-slate-200 hover:bg-slate-300 rounded-md">Kembali</button>
                                    <button type="submit" className="w-full py-3 px-6 bg-purple-500 hover:bg-purple-600 text-white rounded-md">Hantar</button>
                                </div>
                            </form>
                        ) : view === 'thankYou' ? (
                            <div className="text-center">
                                <CheckCircle className="text-green-500 w-16 h-16 mx-auto mb-4" />
                                <h2 className="text-2xl font-bold text-slate-800">Terima Kasih!</h2>
                                <p className="text-slate-600 mt-2">Maklum balas anda telah direkodkan.</p>
                            </div>
                        ) : (
                           <div className="text-center"><p>Sila tunggu...</p></div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// --- Form and Modal Components for Admin ---
function EventForm({ currentDetails, onSubmit, onClose }) { const [details, setDetails] = useState(currentDetails); const handleChange = (e) => setDetails({...details, [e.target.name]: e.target.value}); return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg p-6 w-full max-w-lg relative"><button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700"><X size={24} /></button><h3 className="text-lg font-semibold mb-4 text-slate-700">Edit Event Information</h3><form onSubmit={(e) => { e.preventDefault(); onSubmit(details); }} className="space-y-4"><div><label className="block text-sm font-medium text-slate-700">Event Name</label><input name="eventName" value={details.eventName} onChange={handleChange} className="mt-1 p-2 border rounded-md w-full" /></div><div><label className="block text-sm font-medium text-slate-700">Theme</label><input name="theme" value={details.theme} onChange={handleChange} className="mt-1 p-2 border rounded-md w-full" /></div><div><label className="block text-sm font-medium text-slate-700">Event Date</label><input type="date" name="date" value={details.date} onChange={handleChange} className="mt-1 p-2 border rounded-md w-full" /></div><div><label className="block text-sm font-medium text-slate-700">RSVP Deadline</label><input type="date" name="deadline" value={details.deadline} onChange={handleChange} className="mt-1 p-2 border rounded-md w-full" /></div><div><label className="block text-sm font-medium text-slate-700">Location</label><input name="location" value={details.location} onChange={handleChange} className="mt-1 p-2 border rounded-md w-full" /></div><div className="flex justify-end gap-3 mt-4"><button type="button" onClick={onClose} className="py-2 px-4 bg-slate-300 rounded-md">Cancel</button><button type="submit" className="py-2 px-4 bg-teal-500 text-white rounded-md">Save Changes</button></div></form></div></div>); }
function GuestForm({ db, currentGuest, onComplete, onClose }) { const [guest, setGuest] = useState(currentGuest || { name: '', organization: '', email: '', phone: '', remark: '' }); const isEditing = !!currentGuest; const handleSubmit = async (e) => { e.preventDefault(); if(!guest.name){ return; } const collectionPath = `artifacts/${appId}/public/data/guests`; if (isEditing) { await updateDoc(doc(db, collectionPath, guest.id), guest); } else { await addDoc(collection(db, collectionPath), { ...guest, invitationSent: false, rsvpStatus: 'Pending', createdAt: serverTimestamp() }); } onComplete(); }; return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg p-6 w-full max-w-lg"><h3 className="text-lg font-semibold mb-4">{isEditing ? 'Edit Invitee' : 'Add New Invitee'}</h3><form onSubmit={handleSubmit} className="space-y-4"><input name="name" value={guest.name} onChange={(e) => setGuest({...guest, name:e.target.value})} placeholder="Full Name" className="w-full p-2 border rounded" required /><input name="organization" value={guest.organization} onChange={(e) => setGuest({...guest, organization:e.target.value})} placeholder="Designation / Organization / Affiliation" className="w-full p-2 border rounded" /><input name="email" value={guest.email} onChange={(e) => setGuest({...guest, email:e.target.value})} placeholder="Email" className="w-full p-2 border rounded" /><input name="phone" value={guest.phone} onChange={(e) => setGuest({...guest, phone:e.target.value})} placeholder="Phone" className="w-full p-2 border rounded" /><textarea name="remark" value={guest.remark} onChange={(e) => setGuest({...guest, remark:e.target.value})} placeholder="Admin Remark" className="w-full p-2 border rounded"></textarea><div className="flex justify-end gap-2 mt-4"><button type="button" onClick={onClose} className="py-2 px-4 bg-gray-200 rounded">Cancel</button><button type="submit" className="py-2 px-4 bg-teal-500 text-white rounded">Save</button></div></form></div></div>); }
function QrCodeModal({ guest, onClose }) { const canvasRef = useRef(null); useEffect(() => { if (window.QRCode && canvasRef.current && guest) { const url = `${window.location.origin}${window.location.pathname}?guestId=${guest.id}`; window.QRCode.toCanvas(canvasRef.current, url, { width: 256, margin: 2 }, (error) => { if (error) console.error(error); }); }}, [guest]); const handleDownload = () => { if (canvasRef.current) { const link = document.createElement('a'); link.download = `qrcode-${guest.name.replace(/ /g, '_')}.png`; link.href = canvasRef.current.toDataURL('image/png'); link.click(); }}; return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm relative text-center"><button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700"><X size={24} /></button><h2 className="text-xl font-bold text-slate-800 mb-2">QR Code</h2><p className="text-slate-600 mb-4">{guest.name}</p><div className="flex justify-center mb-4"><canvas ref={canvasRef} /></div><button onClick={handleDownload} className="w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white font-bold py-2 px-4 rounded-lg"><FileDown size={18}/>Download</button></div></div>); }

function ImportModal({ db, onClose, showInfo }) {
    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) setSelectedFile(file);
    };

    const handleDownloadTemplate = () => {
        if (typeof XLSX === 'undefined') {
            showInfo('Excel library is not ready, please try again shortly.');
            return;
        }
        const templateData = [{
            "ID": "Leave this column empty for new guests. Keep ID for updates.",
            "Name": "Dr. Example",
            "Designation / Organization / Affiliation": "Contoh Hospital",
            "Email": "e@mail.com",
            "Phone": "0123456789",
            "Invitation Sent": "No",
            "RSVP Status": "Pending",
            "Representative Name": "",
            "Representative Designation": "",
            "Remark": "Any admin notes here"
        }];
        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Guest Template");
        XLSX.writeFile(wb, "guest_import_template.xlsx");
    };

    const handleUpload = () => {
        if (!selectedFile || typeof XLSX === 'undefined' || !db) return;
        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const results = XLSX.utils.sheet_to_json(worksheet);

                if (results.length === 0) {
                    showInfo("The selected file is empty or in an unsupported format.");
                    setIsUploading(false);
                    return;
                }

                const guestCollectionPath = `artifacts/${appId}/public/data/guests`;
                const batch = writeBatch(db);
                let addedCount = 0;
                let updatedCount = 0;

                results.forEach(row => {
                    // Skip the template's instructional row
                    if (String(row.ID || '').trim() === "Leave this column empty for new guests. Keep ID for updates.") {
                        return;
                    }

                    if (!row.Name || !String(row.Name).trim()) {
                        return; // Skip rows without a name
                    }

                    const guestData = {
                        name: String(row.Name).trim(),
                        organization: String(row['Designation / Organization / Affiliation'] || '').trim(),
                        email: String(row.Email || '').trim(),
                        phone: String(row.Phone || '').trim(),
                        remark: String(row.Remark || '').trim(),
                        rsvpStatus: ['Attending', 'Attending (Wakil)', 'Not Attending', 'Pending'].includes(row['RSVP Status']) ? row['RSVP Status'] : 'Pending',
                        invitationSent: String(row['Invitation Sent']).trim().toLowerCase() === 'yes',
                        representative: (row['Representative Name'] && String(row['Representative Name']).trim())
                            ? {
                                name: String(row['Representative Name']).trim(),
                                designation: String(row['Representative Designation'] || '').trim()
                              }
                            : null
                    };

                    if (guestData.representative && !guestData.representative.name) {
                        guestData.representative = null;
                    }

                    if (row.ID && String(row.ID).trim()) {
                        const guestRef = doc(db, guestCollectionPath, String(row.ID).trim());
                        batch.set(guestRef, guestData, { merge: true }); // Use set with merge to update or create
                        updatedCount++;
                    } else {
                        const newGuestRef = doc(collection(db, guestCollectionPath));
                        guestData.createdAt = serverTimestamp();
                        batch.set(newGuestRef, guestData);
                        addedCount++;
                    }
                });

                if (addedCount === 0 && updatedCount === 0) {
                    showInfo("No valid guest data found to import. Make sure the 'Name' column is present and filled.", "Import Warning");
                    setIsUploading(false);
                    return;
                }

                await batch.commit();
                showInfo(`${addedCount} guest(s) added and ${updatedCount} guest(s) updated/re-added successfully!`, 'Import Complete');
                onClose();
            } catch (err) {
                showInfo("An error occurred during import. Please check the file format and data.", "Import Error");
                console.error(err);
            } finally {
                setIsUploading(false);
            }
        };
        reader.readAsArrayBuffer(selectedFile);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg relative">
                <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700"><X size={24} /></button>
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Import Guest List</h2>
                <div className="space-y-4">
                    <button onClick={handleDownloadTemplate} className="w-full flex items-center justify-center gap-2 bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg"><FileDown size={18}/>Download Template</button>
                    <div className="p-4 bg-slate-100 rounded-md space-y-3">
                        <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg"> <UploadCloud size={18}/>Choose File </button>
                        {selectedFile && <p className="text-center text-sm text-slate-600">Selected: {selectedFile.name}</p>}
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls, .csv" className="hidden" />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={onClose} className="py-2 px-4 bg-gray-300 rounded-md">Cancel</button>
                        <button onClick={handleUpload} disabled={isUploading || !selectedFile} className="py-2 px-4 bg-teal-500 text-white rounded-md disabled:bg-teal-300">{isUploading ? 'Uploading...' : 'Upload'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RepresentativeFormModal({ guest, onUpdate, onClose }) { const [repDetails, setRepDetails] = useState({ name: '', designation: '' }); const handleSubmit = (e) => { e.preventDefault(); if(!repDetails.name || !repDetails.designation) return; onUpdate(guest.id, { rsvpStatus: 'Attending (Wakil)', representative: repDetails }); onClose(); }; return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg relative"><button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-700"><X size={24} /></button><h3 className="text-lg font-semibold mb-4 text-slate-700">Enter Representative Details for {guest.name}</h3><form onSubmit={handleSubmit} className="space-y-4"><input value={repDetails.name} onChange={(e) => setRepDetails({...repDetails, name: e.target.value})} placeholder="Representative Name" className="w-full p-2 border rounded" required /><input value={repDetails.designation} onChange={(e) => setRepDetails({...repDetails, designation: e.target.value})} placeholder="Representative Designation" className="w-full p-2 border rounded" required /><div className="flex justify-end gap-2 mt-4"><button type="button" onClick={onClose} className="py-2 px-4 bg-gray-200 rounded">Cancel</button><button type="submit" className="py-2 px-4 bg-teal-500 text-white rounded">Save</button></div></form></div></div>); }

// --- Guest Row in Admin Table ---
function GuestRow({ guest, onUpdate, onDelete, onEdit, onShowQr, onShowRepForm, showInfoModal }) {
    const handleRsvpChange = (e) => {
        const newStatus = e.target.value;
        if (newStatus === 'Attending (Wakil)') {
            onShowRepForm();
        } else {
            onUpdate(guest.id, { rsvpStatus: newStatus, representative: null });
        }
    };
    const handleInviteSentToggle = () => onUpdate(guest.id, { invitationSent: !guest.invitationSent });
    const handleCopyLink = () => {
        const url = `${window.location.origin}${window.location.pathname}?guestId=${guest.id}`;
        const textArea = document.createElement("textarea");
        textArea.style.position = "fixed"; // prevent scrolling to bottom
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showInfoModal('Pautan jemputan telah disalin!', 'Berjaya');
        } catch (err) {
            showInfoModal('Gagal menyalin pautan.', 'Ralat');
        }
        document.body.removeChild(textArea);
    };
    const rsvpColorClass = { 'Attending': 'bg-green-100 text-green-800', 'Attending (Wakil)': 'bg-purple-100 text-purple-800', 'Not Attending': 'bg-red-100 text-red-800', 'Pending': 'bg-yellow-100 text-yellow-800', }[guest.rsvpStatus];
    return (<tr className="hover:bg-slate-50"><td className="p-4 align-top"><div className="font-medium text-slate-800">{guest.name}</div><div className="text-xs text-slate-500">{guest.email||''} | {guest.phone||''}</div>{guest.representative?.name && <p className="text-xs text-purple-600 font-semibold mt-1">Wakil: {guest.representative.name} ({guest.representative.designation})</p>}{guest.remark && <p className="text-xs text-slate-500 italic mt-1">"{guest.remark}"</p>}</td><td className="p-4 align-top">{guest.organization}</td><td className="p-4 text-center"><button onClick={handleInviteSentToggle} className={`p-2 rounded-full transition-colors ${guest.invitationSent ? 'text-teal-500 hover:bg-teal-100' : 'text-slate-400 hover:bg-slate-200'}`} title={guest.invitationSent ? 'Mark as Not Sent' : 'Mark as Sent'}><Send size={20} /></button></td><td className="p-4 align-top text-center"><select value={guest.rsvpStatus} onChange={handleRsvpChange} className={`text-xs font-semibold py-1 px-2 rounded-full border-0 focus:ring-2 ${rsvpColorClass}`}><option value="Pending">Pending</option><option value="Attending">Attending</option><option value="Attending (Wakil)">Attending (Wakil)</option><option value="Not Attending">Not Attending</option></select></td><td className="p-4 align-top text-center"><div className="flex justify-center items-center gap-1"><button onClick={handleCopyLink} title="Copy Link" className="p-2 text-slate-500 hover:text-green-600 rounded-full"><Link2 size={16}/></button><button onClick={onShowQr} title="QR Code" className="p-2 text-slate-500 hover:text-indigo-600 rounded-full"><QrCode size={16}/></button><button onClick={onEdit} title="Edit" className="p-2 text-slate-500 hover:text-blue-600 rounded-full"><Edit3 size={16}/></button><button onClick={onDelete} title="Delete" className="p-2 text-slate-500 hover:text-red-600 rounded-full"><Trash2 size={16}/></button></div></td></tr>);
}

export default App;
