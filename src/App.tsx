import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Map as LeafletMap, Marker } from "leaflet";
import type { FormEvent } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import type { Auth, User } from "firebase/auth";
import { onValue, ref, serverTimestamp, set } from "firebase/database";
import type { Database, Unsubscribe } from "firebase/database";
import { auth, database, missingFirebaseConfig } from "./firebase";

type LocationData = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  positionAt?: number;
  updatedAt?: number;
};

function App() {
  if (missingFirebaseConfig.length > 0) {
    return <SetupScreen missingConfig={missingFirebaseConfig} />;
  }

  if (!auth || !database) {
    return <SetupScreen missingConfig={["No se pudo inicializar Firebase; revisa la configuración de .env."]} />;
  }

  return <Dashboard firebaseAuth={auth} firebaseDatabase={database} />;
}

function SetupScreen({ missingConfig }: { missingConfig: string[] }) {
  return (
    <main className="setup-shell">
      <section className="setup-card">
        <div className="brand"><span className="brand-mark"><PulseIcon /></span><span>pulse<span className="brand-dot">.</span></span></div>
        <p className="eyebrow">ÚLTIMO PASO DE CONFIGURACIÓN</p>
        <h1>Conecta tu proyecto</h1>
        <p className="setup-copy">El panel ya está listo. Completa estos ajustes para conectarlo con Firebase:</p>
        <ol className="setup-list">
          {missingConfig.map((key) => <li key={key}><code>{key}</code><span>Obtén el valor en Firebase Console → Configuración del proyecto → Tus aplicaciones web.</span></li>)}
          <li><code>OpenStreetMap</code><span>El mapa usa datos abiertos y no necesita una API key. La atribución a OpenStreetMap aparece en el mapa.</span></li>
        </ol>
        <p className="setup-foot"><LockIcon /> No pongas la clave privada de Firebase Admin en el navegador.</p>
      </section>
    </main>
  );
}

function Dashboard({ firebaseAuth, firebaseDatabase }: { firebaseAuth: Auth; firebaseDatabase: Database }) {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState<LocationData | null>(null);
  const [message, setMessage] = useState("");
  const [mapError, setMapError] = useState("");
  const [tracking, setTracking] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const watchId = useRef<number | null>(null);
  const publishIntervalId = useRef<number | null>(null);
  const latestPosition = useRef<GeolocationPosition | null>(null);
  const isPublishing = useRef(false);

  useEffect(() => onAuthStateChanged(firebaseAuth, setUser), [firebaseAuth]);

  useEffect(() => () => {
    if (watchId.current !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
    }
      if (publishIntervalId.current !== null) {
        window.clearInterval(publishIntervalId.current);
      }
    }, []);

  useEffect(() => {
    if (!user) {
      setLocation(null);
      return;
    }

    const locationRef = ref(firebaseDatabase, `locations/${user.uid}/current`);
    const unsubscribe: Unsubscribe = onValue(
      locationRef,
      (snapshot) => {
        setLocation(snapshot.exists() ? snapshot.val() as LocationData : null);
        setMessage("");
      },
      (error) => setMessage(`No se pudo leer la ubicación: ${error.message}`)
    );

    return unsubscribe;
  }, [firebaseDatabase, user]);

  useEffect(() => {
    if (!user || !mapElement.current) return;

    setMapError("");
    const initialCenter: L.LatLngExpression = location
      ? [location.latitude, location.longitude]
      : [20, 0];
    const initialZoom = location ? 15 : 2;
    const leafletMap = L.map(mapElement.current, {
      zoomControl: true,
      attributionControl: true
    }).setView(initialCenter, initialZoom);
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
    }).addTo(leafletMap);
    tiles.on("tileerror", () => setMapError("No se pudieron cargar los mapas de OpenStreetMap. Comprueba tu conexión a internet."));

    marker.current = L.marker(initialCenter, {
      icon: L.divIcon({
        className: "location-marker-icon",
        html: '<span class="location-marker-pulse"></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      }),
      title: "Ubicación actual"
    });
    if (location) marker.current.addTo(leafletMap);
    map.current = leafletMap;

    return () => {
      leafletMap.remove();
      map.current = null;
      marker.current = null;
    };
  }, [user]);

  useEffect(() => {
    if (location && map.current) updateMarker(location);
  }, [location]);

  function updateMarker(current: LocationData) {
    if (!map.current || !marker.current) return;
    const position: L.LatLngExpression = [current.latitude, current.longitude];
    marker.current.setLatLng(position);
    if (!map.current.hasLayer(marker.current)) marker.current.addTo(map.current);
    map.current.setView(position, Math.max(map.current.getZoom(), 15), { animate: true });
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo iniciar sesión.");
    }
  }

  async function handleLogout() {
    try {
      stopTracking();
      await signOut(firebaseAuth);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cerrar sesión.");
    }
  }

  function stopTracking() {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (publishIntervalId.current !== null) {
      window.clearInterval(publishIntervalId.current);
      publishIntervalId.current = null;
    }
    latestPosition.current = null;
    setTracking(false);
  }

  function startTracking() {
    if (!user) {
      setTrackingError("Inicia sesión antes de compartir tu ubicación.");
      return;
    }

    if (!navigator.geolocation) {
      setTrackingError("Este navegador no ofrece geolocalización.");
      return;
    }

    const trackingUid = user.uid;
    setTrackingError("");
    setTracking(true);
    latestPosition.current = null;
    let receivedFirstPosition = false;

    const publishLatestPosition = async () => {
      const position = latestPosition.current;
      if (!position || isPublishing.current || firebaseAuth.currentUser?.uid !== trackingUid) return;
      if (Date.now() - position.timestamp > 15_000) {
        setTrackingError("El GPS no ha entregado una posición nueva. Comprueba la señal de ubicación del dispositivo.");
        return;
      }

      isPublishing.current = true;
      try {
        const locationRef = ref(firebaseDatabase, `locations/${trackingUid}/current`);
        await set(locationRef, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          positionAt: position.timestamp,
          updatedAt: serverTimestamp()
        });
        setTrackingError("");
      } catch (error) {
        setTrackingError(error instanceof Error ? error.message : "No se pudo guardar la ubicación en Firebase.");
      } finally {
        isPublishing.current = false;
      }
    };

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        latestPosition.current = position;
        setTrackingError("");
        if (!receivedFirstPosition) {
          receivedFirstPosition = true;
          void publishLatestPosition();
        }
      },
      (error) => {
        stopTracking();
        const explanation = error.code === error.PERMISSION_DENIED
          ? "El navegador no tiene permiso para acceder a la ubicación. Permítelo en los ajustes del sitio."
          : error.code === error.POSITION_UNAVAILABLE
            ? "El dispositivo no pudo determinar su ubicación."
            : "Se agotó el tiempo de espera del GPS. Inténtalo de nuevo.";
        setTrackingError(explanation);
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    );
    publishIntervalId.current = window.setInterval(() => {
      void publishLatestPosition();
    }, 1000);
  }

  const age = location?.positionAt ? Date.now() - location.positionAt : null;
  const isLive = age !== null && age < 15_000;

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand brand-center"><span className="brand-mark"><PulseIcon /></span><span>pulse<span className="brand-dot">.</span></span></div>
          <p className="eyebrow">UBICACIÓN EN TIEMPO REAL</p>
          <h1>Tu movimiento,<br /><span>en el mapa.</span></h1>
          <p className="login-copy">Inicia sesión con la misma cuenta de tu app móvil para ver tu ubicación en vivo.</p>
          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="email">Correo electrónico</label>
            <input id="email" type="email" autoComplete="username" placeholder="tu@correo.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {message && <p className="error-message" role="alert">{message}</p>}
            <button className="primary-button" type="submit">Entrar al panel <ArrowIcon /></button>
          </form>
          <p className="login-foot"><LockIcon /> Conexión privada y protegida por Firebase</p>
        </section>
        <div className="login-orbit orbit-one" /><div className="login-orbit orbit-two" />
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><PulseIcon /></span><span>pulse<span className="brand-dot">.</span></span></div>
        <div className="topbar-right">
          <span className="account-label"><span className="avatar">{user.email?.[0]?.toUpperCase() ?? "U"}</span><span className="account-email">{user.email}</span></span>
          <button className="signout-button" onClick={handleLogout}>Salir <ExitIcon /></button>
        </div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">PANEL DE SEGUIMIENTO</p>
          <h1>Vista en vivo</h1>
          <p className="subtitle">Abre esta web en el dispositivo que quieres ver y activa el GPS en vivo.</p>
        </div>
        <div className="heading-actions">
          <button className={`tracking-button ${tracking ? "tracking-active" : ""}`} onClick={tracking ? stopTracking : startTracking}>
            <span className={`live-dot ${tracking ? "tracking-pulse" : ""}`} />
            {tracking ? "Detener ubicación" : "Compartir mi ubicación"}
          </button>
          <div className={`live-pill ${isLive ? "is-live" : ""}`}><span className="live-dot" />{isLive ? "EN VIVO" : "ESPERANDO SEÑAL"}</div>
        </div>
      </section>

      {trackingError && <p className="tracking-error" role="alert">{trackingError}</p>}

      <section className="content-grid">
        <div className="map-card">
          <div className="map-topline"><span><span className="map-pin"><PinIcon /></span> Mapa de ubicación</span><span className="map-provider">OPENSTREETMAP</span></div>
          <div className="map-area">
            <div ref={mapElement} className="map-canvas" aria-label="Mapa con ubicación actual" />
            {mapError && <div className="map-overlay map-warning"><span className="warning-icon">!</span><strong>No se pudo cargar el mapa</strong><span>{mapError}</span></div>}
            {!location && <div className="map-overlay empty-overlay"><span className="empty-radar"><PulseIcon /></span><strong>Esperando ubicación</strong><span>Abre tu app móvil para comenzar a compartir.</span></div>}
            {location && <div className="map-coordinate-chip"><span className="chip-dot" /> Ubicación actual</div>}
          </div>
          <div className="map-footer"><span><span className={`connection-dot ${tracking ? "connected" : ""}`} />{tracking ? "Compartiendo ubicación desde este dispositivo" : isLive ? "Ubicación recibida" : "Seguimiento detenido"}</span><span>Actualización automática</span></div>
        </div>

        <aside className="side-column">
          <section className="info-card position-card">
            <div className="card-heading"><div><p className="eyebrow">POSICIÓN ACTUAL</p><h2>Coordenadas</h2></div><span className="card-icon"><PinIcon /></span></div>
            {location ? (
              <div className="coordinates">
                <div><span>LATITUD</span><strong>{location.latitude.toFixed(6)}<small>°</small></strong></div>
                <div><span>LONGITUD</span><strong>{location.longitude.toFixed(6)}<small>°</small></strong></div>
              </div>
            ) : <p className="empty-copy">Todavía no recibimos datos de ubicación.</p>}
            <div className="card-divider" />
            <div className="updated-row"><span>Última posición GPS</span><strong>{location?.positionAt ? new Date(location.positionAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</strong></div>
          </section>

          <section className="info-card details-card">
            <div className="card-heading"><div><p className="eyebrow">DATOS DEL DISPOSITIVO</p><h2>Detalles</h2></div><span className="card-icon"><SignalIcon /></span></div>
            <div className="detail-row"><span><TargetIcon /> Precisión GPS</span><strong>{location?.accuracy != null ? `±${Math.round(location.accuracy)} m` : "—"}</strong></div>
            <div className="detail-row"><span><SpeedIcon /> Velocidad</span><strong>{location?.speed != null ? `${(location.speed * 3.6).toFixed(1)} km/h` : "—"}</strong></div>
            <div className="detail-row"><span><CompassIcon /> Dirección</span><strong>{location?.heading != null ? `${Math.round(location.heading)}°` : "—"}</strong></div>
          </section>

          <div className="privacy-note"><LockIcon /><span><strong>Tus datos son privados</strong><br />Solo tu cuenta puede consultar esta ubicación.</span></div>
        </aside>
      </section>
      {message && <p className="toast-message" role="alert">{message}</p>}
      <footer className="footer"><span>Pulse <span className="brand-dot">·</span> seguimiento privado</span><span>Con tecnología de Firebase</span></footer>
    </main>
  );
}

function PulseIcon() { return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function ArrowIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function LockIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="4.5" y="8.5" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M7 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>; }
function ExitIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3m4-3 3-3-3-3m3 3H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function PinIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M16 8.3c0 4.5-6 9-6 9s-6-4.5-6-9a6 6 0 1 1 12 0Z" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" /></svg>; }
function SignalIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 7.5a10.4 10.4 0 0 1 14 0M5.8 10.4a6.2 6.2 0 0 1 8.4 0m-5.5 3a2 2 0 0 1 2.6 0M10 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>; }
function TargetIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" /><path d="M10 1.5v2m0 13v2m8.5-8.5h-2m-13 0h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>; }
function SpeedIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3.5 14a7 7 0 1 1 13 0H3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="m10 10 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="10" cy="10" r="1" fill="currentColor" /></svg>; }
function CompassIcon() { return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" /><path d="m12.8 7.2-1.7 4-4 1.6 1.7-4 4-1.6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>; }

export default App;
