import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, REQUEST_STATUSES, STATUSES } from "./lib/constants.js";
import { getPhotoUrl, isSupabaseConfigured, supabase } from "./lib/supabase.js";

const PHOTO_BUCKET = "lost-item-photos";

function createInitialLostItem() {
  const now = new Date();
  return {
    category: "Téléphone",
    bus_line: "",
    found_date: now.toISOString().slice(0, 10),
    found_time: now.toTimeString().slice(0, 5),
    location: "",
    note: "",
    status: "found",
  };
}

function useHashRoute() {
  const [route, setRoute] = useState(window.location.hash.replace("#", "") || "/");

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash.replace("#", "") || "/");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (nextRoute) => {
    window.location.hash = nextRoute;
    setRoute(nextRoute);
  };

  return [route, navigate];
}

function App() {
  const [route, navigate] = useHashRoute();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [toasts, setToasts] = useState([]);

  const notify = (message, type = "success") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        notify("Impossible de charger le profil utilisateur.", "error");
        setProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfile(data);
      setProfileLoading(false);
    }

    loadProfile();
  }, [session]);

  const canAccessStaff = profile?.role === "driver" || profile?.role === "admin";
  const canAccessAdmin = profile?.role === "admin";

  const page = useMemo(() => {
    const isUserContextLoading = authLoading || (Boolean(session) && profileLoading);

    if (route === "/login") {
      return <LoginPage notify={notify} />;
    }

    if (route === "/driver") {
      return isUserContextLoading ? (
        <LoadingScreen />
      ) : session && canAccessStaff ? (
        <DriverDashboard session={session} notify={notify} />
      ) : (
        <AuthRequired role="conducteur" navigate={navigate} />
      );
    }

    if (route === "/admin") {
      return isUserContextLoading ? (
        <LoadingScreen />
      ) : session && canAccessAdmin ? (
        <AdminDashboard notify={notify} />
      ) : (
        <AuthRequired role="administrateur" navigate={navigate} />
      );
    }

    return <PassengerSearch notify={notify} />;
  }, [route, authLoading, profileLoading, session, canAccessStaff, canAccessAdmin]);

  const signOut = async () => {
    await supabase.auth.signOut();
    notify("Déconnexion réussie.");
    navigate("/");
  };

  return (
    <>
      <div className="app-shell">
        <Header
          route={route}
          navigate={navigate}
          session={session}
          profile={profile}
          onSignOut={signOut}
        />
        {!isSupabaseConfigured && <ConfigNotice />}
        <main>{page}</main>
      </div>
      <ToastStack toasts={toasts} />
    </>
  );
}

function Header({ route, navigate, session, profile, onSignOut }) {
  const navItems = [
    { route: "/", label: "Recherche" },
    { route: "/driver", label: "Conducteur" },
    { route: "/admin", label: "Admin" },
  ];

  return (
    <header className="topbar">
      <button className="brand" onClick={() => navigate("/")} aria-label="Accueil LostBus">
        <span className="brand-mark">LB</span>
        <span>
          <strong>LostBus</strong>
          <small>Objets perdus transport</small>
        </span>
      </button>

      <nav className="nav-pills" aria-label="Navigation principale">
        {navItems.map((item) => (
          <button
            key={item.route}
            className={route === item.route ? "active" : ""}
            onClick={() => navigate(item.route)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="account-chip">
        {session ? (
          <>
            <span>{profile?.full_name || session.user.email}</span>
            <button onClick={onSignOut}>Sortir</button>
          </>
        ) : (
          <button onClick={() => navigate("/login")}>Connexion</button>
        )}
      </div>
    </header>
  );
}

function ConfigNotice() {
  return (
    <section className="notice">
      <strong>Configuration Supabase requise</strong>
      <span>
        Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans un fichier
        <code>.env</code> pour activer les données, l’authentification et les photos.
      </span>
    </section>
  );
}

function LoginPage({ notify }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!isSupabaseConfigured) {
      notify("Ajoutez la configuration Supabase avant de vous connecter.", "error");
      return;
    }

    if (!email || !password) {
      notify("Email et mot de passe sont obligatoires.", "error");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      notify("Connexion impossible. Vérifiez les identifiants.", "error");
      return;
    }

    notify("Bienvenue dans LostBus.");
    window.location.hash = "/driver";
  };

  return (
    <section className="split-layout">
      <div className="intro-panel">
        <p className="eyebrow">Accès sécurisé</p>
        <h1>Connexion conducteur et administrateur</h1>
        <p>
          Les comptes sont créés côté Supabase par la société de transport. Les passagers utilisent la
          recherche publique sans connexion.
        </p>
      </div>

      <form className="panel form-stack" onSubmit={onSubmit}>
        <label>
          Email professionnel
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="conducteur@transport.fr"
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Votre mot de passe"
          />
        </label>
        <button className="primary-action" disabled={loading}>
          {loading ? <Spinner /> : "Se connecter"}
        </button>
      </form>
    </section>
  );
}

function DriverDashboard({ session, notify }) {
  const [form, setForm] = useState(createInitialLostItem);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoDebug, setPhotoDebug] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(false);

  const updateField = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const onPhotoChange = (event) => {
    const file = event.target.files?.[0] || null;
    setPhotoDebug(
  file
    ? `Fichier détecté : ${file.name} / ${file.type} / ${Math.round(file.size / 1024)} Ko`
    : "Aucun fichier détecté"
);

    if (!file) {
      setPhoto(null);
      setPhotoPreview("");
      return;
    }

    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const uploadPhoto = async (file) => {
    if (!file) return null;

    const safeName = (file.name || "photo-mobile.jpg")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-");
    const photoPath = `${session.user.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(photoPath, file, {
        cacheControl: "3600",
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    return photoPath;
  };

  const validate = () => {
    const required = ["category", "bus_line", "found_date", "found_time", "location", "status"];
    const missing = required.find((field) => !form[field]);
    if (missing) return "Tous les champs principaux doivent être renseignés.";
    return "";
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      notify(validationError, "error");
      return;
    }

    if (!isSupabaseConfigured) {
      notify("Configuration Supabase manquante.", "error");
      return;
    }

    setLoading(true);
    let photoPath = null;

    try {
      const fileToUpload =
  photo ||
  event.currentTarget.querySelector('input[type="file"]')?.files?.[0] ||
  null;

photoPath = await uploadPhoto(fileToUpload);
    } catch (uploadError) {
      setLoading(false);
      notify(
        `La photo n’a pas pu être téléversée. L’objet n’a pas été enregistré. ${uploadError.message || ""}`.trim(),
        "error"
      );
      return;
    }

    const { error } = await supabase.from("lost_items").insert({
      ...form,
      photo_path: photoPath,
      created_by: session.user.id,
    });

    setLoading(false);

    if (error) {
      notify("Impossible d’enregistrer l’objet.", "error");
      return;
    }

    setForm(createInitialLostItem());
    setPhoto(null);
    setPhotoPreview("");
    setConfirmation(true);
    notify("Objet perdu ajouté.");
  };

  return (
    <section className="page-grid">
      <div className="page-heading">
        <p className="eyebrow">Tableau de bord conducteur</p>
        <h1>Ajouter un objet perdu</h1>
        <p>Photo, ligne, lieu et statut. Le formulaire tient en main, même depuis un quai ou un dépôt.</p>
      </div>

      <form className="panel form-stack" onSubmit={onSubmit}>
        <label className="photo-uploader">
          <span>{photoPreview ? "Photo sélectionnée" : "Photo depuis la caméra"}</span>
          {photoPreview ? (
            <img src={photoPreview} alt="Aperçu de l’objet" />
          ) : (
            <div className="photo-empty">Ouvrir l’appareil photo</div>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhotoChange}
          />
          <p style={{ color: "yellow", fontSize: "12px" }}>
  {photoDebug}
</p>
          <p style={{ color: "yellow", fontSize: "12px" }}>
  {photoDebug}
</p>
        </label>

        <label>
          Catégorie
          <select value={form.category} onChange={(event) => updateField("category", event.target.value)}>
            {CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>

        <div className="form-row">
          <label>
            Ligne de bus
            <input
              value={form.bus_line}
              onChange={(event) => updateField("bus_line", event.target.value)}
              placeholder="Ex. L42"
            />
          </label>
          <label>
            Statut
            <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label>
            Date
            <input
              type="date"
              value={form.found_date}
              onChange={(event) => updateField("found_date", event.target.value)}
            />
          </label>
          <label>
            Heure
            <input
              type="time"
              value={form.found_time}
              onChange={(event) => updateField("found_time", event.target.value)}
            />
          </label>
        </div>

        <label>
          Lieu
          <input
            value={form.location}
            onChange={(event) => updateField("location", event.target.value)}
            placeholder="Dépôt, terminus, siège, véhicule..."
          />
        </label>

        <label>
          Note courte
          <textarea
            rows="3"
            value={form.note}
            onChange={(event) => updateField("note", event.target.value)}
            placeholder="Couleur, siège, contexte de découverte..."
          />
        </label>

        <button className="primary-action" disabled={loading}>
          {loading ? <Spinner /> : "Envoyer l’objet"}
        </button>
      </form>

      {confirmation && (
        <Modal title="Objet enregistré" onClose={() => setConfirmation(false)}>
          <p>L’objet est maintenant visible dans le tableau de bord administrateur et la recherche publique.</p>
          <button className="primary-action" onClick={() => setConfirmation(false)}>
            Ajouter un autre objet
          </button>
        </Modal>
      )}
    </section>
  );
}

function PassengerSearch({ notify }) {
  const [filters, setFilters] = useState({ category: "", bus_line: "", found_date: "" });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const search = async (event) => {
    event?.preventDefault();

    if (!isSupabaseConfigured) {
      notify("Connectez Supabase pour lancer une recherche réelle.", "error");
      return;
    }

    setLoading(true);
    let query = supabase
      .from("public_lost_items")
      .select("*")
      .neq("status", "returned")
      .order("found_date", { ascending: false })
      .limit(40);

    if (filters.category) query = query.eq("category", filters.category);
    if (filters.bus_line) query = query.ilike("bus_line", `%${filters.bus_line}%`);
    if (filters.found_date) query = query.eq("found_date", filters.found_date);

    const { data, error } = await query;
    setLoading(false);

    if (error) {
      notify("La recherche a échoué.", "error");
      return;
    }

    setItems(data || []);
  };

  useEffect(() => {
    if (isSupabaseConfigured) search();
  }, []);

  return (
    <section className="page-grid">
      <div className="hero-band">
        <p className="eyebrow">Recherche passager</p>
        <h1>Retrouvez un objet oublié dans un bus ou un autocar</h1>
        <p>Filtrez par catégorie, ligne et date. Les photos restent floutées jusqu’à vérification.</p>
      </div>

      <form className="panel search-panel" onSubmit={search}>
        <label>
          Catégorie
          <select
            value={filters.category}
            onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
          >
            <option value="">Toutes</option>
            {CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          Ligne
          <input
            value={filters.bus_line}
            onChange={(event) => setFilters((current) => ({ ...current, bus_line: event.target.value }))}
            placeholder="Ex. L42"
          />
        </label>
        <label>
          Date
          <input
            type="date"
            value={filters.found_date}
            onChange={(event) => setFilters((current) => ({ ...current, found_date: event.target.value }))}
          />
        </label>
        <button className="primary-action" disabled={loading}>
          {loading ? <Spinner /> : "Rechercher"}
        </button>
      </form>

      <div className="results-grid">
        {loading && <LoadingCards />}
        {!loading && items.length === 0 && (
          <EmptyState title="Aucun résultat" text="Essayez une autre ligne, catégorie ou date." />
        )}
        {!loading &&
          items.map((item) => (
            <LostItemCard key={item.id} item={item} onClaim={() => setSelectedItem(item)} />
          ))}
      </div>

      {selectedItem && (
        <RecoveryModal item={selectedItem} onClose={() => setSelectedItem(null)} notify={notify} />
      )}
    </section>
  );
}

function LostItemCard({ item, onClaim }) {
  const status = STATUSES.find((entry) => entry.value === item.status)?.label || item.status;

  return (
    <article className="item-card">
      <div className="item-photo">
        {item.photo_path ? (
          <img className="blurred" src={getPhotoUrl(item.photo_path)} alt="" />
        ) : (
          <span>Pas de photo</span>
        )}
      </div>
      <div className="item-card-body">
        <div>
          <span className="status-pill">{status}</span>
          <h3>{item.category}</h3>
        </div>
        <dl>
          <div>
            <dt>Ligne</dt>
            <dd>{item.bus_line}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatDate(item.found_date)}</dd>
          </div>
          <div>
            <dt>Lieu</dt>
            <dd>{item.location}</dd>
          </div>
        </dl>
        <button className="secondary-action" onClick={onClaim}>
          Cet objet pourrait être le mien
        </button>
      </div>
    </article>
  );
}

function RecoveryModal({ item, onClose, notify }) {
  const [form, setForm] = useState({ passenger_name: "", passenger_email: "", description: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submitRequest = async (event) => {
    event.preventDefault();
    if (!form.passenger_name || !form.passenger_email || form.description.length < 12) {
      notify("Ajoutez votre nom, email et une description précise.", "error");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("recovery_requests").insert({
      lost_item_id: item.id,
      passenger_name: form.passenger_name,
      passenger_email: form.passenger_email,
      description: form.description,
    });
    setLoading(false);

    if (error) {
      notify("La demande n’a pas pu être envoyée.", "error");
      return;
    }

    setDone(true);
    notify("Demande envoyée à l’administrateur.");
  };

  return (
    <Modal title={done ? "Demande envoyée" : "Demande de récupération"} onClose={onClose}>
      {done ? (
        <p>Un administrateur comparera votre description avec l’objet trouvé avant de vous répondre.</p>
      ) : (
        <form className="form-stack" onSubmit={submitRequest}>
          <div className="claim-summary">
            {item.category} · Ligne {item.bus_line} · {formatDate(item.found_date)}
          </div>
          <label>
            Nom
            <input
              value={form.passenger_name}
              onChange={(event) => setForm((current) => ({ ...current, passenger_name: event.target.value }))}
              placeholder="Votre nom"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.passenger_email}
              onChange={(event) => setForm((current) => ({ ...current, passenger_email: event.target.value }))}
              placeholder="vous@email.fr"
            />
          </label>
          <label>
            Description de l’objet
            <textarea
              rows="4"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Marque, couleur, contenu, signe distinctif..."
            />
          </label>
          <button className="primary-action" disabled={loading}>
            {loading ? <Spinner /> : "Envoyer la demande"}
          </button>
        </form>
      )}
    </Modal>
  );
}

function AdminDashboard({ notify }) {
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [filters, setFilters] = useState({ status: "", bus_line: "", found_date: "" });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("items");

  const loadAdminData = async () => {
    setLoading(true);

    let itemsQuery = supabase.from("lost_items").select("*").order("created_at", { ascending: false });
    if (filters.status) itemsQuery = itemsQuery.eq("status", filters.status);
    if (filters.bus_line) itemsQuery = itemsQuery.ilike("bus_line", `%${filters.bus_line}%`);
    if (filters.found_date) itemsQuery = itemsQuery.eq("found_date", filters.found_date);

    const [itemsResult, requestsResult] = await Promise.all([
      itemsQuery,
      supabase
        .from("recovery_requests")
        .select("*, lost_items(category, bus_line, found_date)")
        .order("created_at", { ascending: false }),
    ]);

    setLoading(false);

    if (itemsResult.error || requestsResult.error) {
      notify("Chargement administrateur impossible.", "error");
      return;
    }

    setItems(itemsResult.data || []);
    setRequests(requestsResult.data || []);
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const updateItemStatus = async (id, status) => {
    const { error } = await supabase.from("lost_items").update({ status }).eq("id", id);
    if (error) {
      notify("Statut non mis à jour.", "error");
      return;
    }
    setItems((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
    notify("Statut mis à jour.");
  };

  const deleteItem = async (id) => {
    if (!window.confirm("Supprimer définitivement cet objet ?")) return;

    const { error } = await supabase.from("lost_items").delete().eq("id", id);
    if (error) {
      notify("Suppression impossible.", "error");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
    notify("Objet supprimé.");
  };

  const updateRequestStatus = async (id, request_status) => {
    const { error } = await supabase.from("recovery_requests").update({ request_status }).eq("id", id);
    if (error) {
      notify("Demande non mise à jour.", "error");
      return;
    }
    setRequests((current) =>
      current.map((request) => (request.id === id ? { ...request, request_status } : request))
    );
    notify("Demande mise à jour.");
  };

  return (
    <section className="page-grid">
      <div className="page-heading admin-heading">
        <div>
          <p className="eyebrow">Tableau de bord administrateur</p>
          <h1>Objets et demandes</h1>
        </div>
        <div className="segmented">
          <button className={activeTab === "items" ? "active" : ""} onClick={() => setActiveTab("items")}>
            Objets
          </button>
          <button className={activeTab === "requests" ? "active" : ""} onClick={() => setActiveTab("requests")}>
            Demandes
          </button>
        </div>
      </div>

      {activeTab === "items" && (
        <>
          <form className="panel search-panel" onSubmit={(event) => {
            event.preventDefault();
            loadAdminData();
          }}>
            <label>
              Statut
              <select
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              >
                <option value="">Tous</option>
                {STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ligne
              <input
                value={filters.bus_line}
                onChange={(event) => setFilters((current) => ({ ...current, bus_line: event.target.value }))}
                placeholder="Ex. L42"
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={filters.found_date}
                onChange={(event) => setFilters((current) => ({ ...current, found_date: event.target.value }))}
              />
            </label>
            <button className="primary-action" disabled={loading}>
              {loading ? <Spinner /> : "Filtrer"}
            </button>
          </form>

          <div className="admin-list">
            {loading && <LoadingCards />}
            {!loading && items.length === 0 && <EmptyState title="Aucun objet" text="Aucun objet ne correspond aux filtres." />}
            {!loading &&
              items.map((item) => (
                <article className="admin-row" key={item.id}>
                  <div className="mini-photo">
                    {item.photo_path ? <img src={getPhotoUrl(item.photo_path)} alt="" /> : <span />}
                  </div>
                  <div>
                    <h3>{item.category}</h3>
                    <p>
                      Ligne {item.bus_line} · {formatDate(item.found_date)} · {item.location}
                    </p>
                    {item.note && <small>{item.note}</small>}
                  </div>
                  <select value={item.status} onChange={(event) => updateItemStatus(item.id, event.target.value)}>
                    {STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  <div className="row-actions">
                    <button className="secondary-action" onClick={() => updateItemStatus(item.id, "returned")}>
                      Restitué
                    </button>
                    <button className="danger-action" onClick={() => deleteItem(item.id)}>
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
          </div>
        </>
      )}

      {activeTab === "requests" && (
        <div className="admin-list">
          {requests.length === 0 && <EmptyState title="Aucune demande" text="Les demandes passagers apparaîtront ici." />}
          {requests.map((request) => (
            <article className="request-row" key={request.id}>
              <div>
                <span className="status-pill">
                  {REQUEST_STATUSES.find((status) => status.value === request.request_status)?.label || "Nouvelle"}
                </span>
                <h3>{request.passenger_name}</h3>
                <p>{request.passenger_email}</p>
                <small>
                  {request.lost_items?.category} · Ligne {request.lost_items?.bus_line} ·{" "}
                  {formatDate(request.lost_items?.found_date)}
                </small>
              </div>
              <p className="request-description">{request.description}</p>
              <select
                value={request.request_status}
                onChange={(event) => updateRequestStatus(request.id, event.target.value)}
              >
                {REQUEST_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AuthRequired({ role, navigate }) {
  return (
    <section className="panel centered-panel">
      <p className="eyebrow">Accès réservé</p>
      <h1>Connexion {role} nécessaire</h1>
      <p>Les pages internes sont protégées par Supabase Auth et les règles de sécurité de la base.</p>
      <button className="primary-action" onClick={() => navigate("/login")}>
        Se connecter
      </button>
    </section>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ToastStack({ toasts }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast ${toast.type}`} key={toast.id}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <section className="centered-panel">
      <Spinner />
      <p>Chargement...</p>
    </section>
  );
}

function LoadingCards() {
  return (
    <>
      <div className="skeleton-card" />
      <div className="skeleton-card" />
      <div className="skeleton-card" />
    </>
  );
}

function Spinner() {
  return <span className="spinner" aria-label="Chargement" />;
}

function formatDate(value) {
  if (!value) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${value}T00:00:00`)
  );
}

export default App;
