// Several devices in one test, taking turns in the one browser: each keeps its own
// localStorage, IndexedDB and cookies, put away when another device is picked up.

interface SavedIndex {
  name: string;
  keyPath: string | string[];
  unique: boolean;
  multiEntry: boolean;
}

interface SavedStore {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  indexes: SavedIndex[];
  keys: IDBValidKey[];
  values: unknown[];
}

interface SavedDatabase {
  name: string;
  version: number;
  stores: SavedStore[];
}

interface DeviceState {
  local: Record<string, string>;
  databases: SavedDatabase[];
  cookies: Cypress.Cookie[];
}

const EMPTY: DeviceState = { local: {}, databases: [], cookies: [] };

let holding: string | null = null;
const putAway = new Map<string, DeviceState>();

beforeEach(() => {
  holding = null;
  putAway.clear();
});

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function opened(request: IDBOpenDBRequest): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("A page still holds the database open"));
  });
}

function savedIndex(index: IDBIndex): SavedIndex {
  return {
    name: index.name,
    keyPath: index.keyPath,
    unique: index.unique,
    multiEntry: index.multiEntry,
  };
}

// Copied into this frame: the page's own objects go when it navigates.
async function savedStore(store: IDBObjectStore): Promise<SavedStore> {
  const [keys, values] = await Promise.all([
    settled(store.getAllKeys()),
    settled(store.getAll()),
  ]);
  return {
    name: store.name,
    keyPath: store.keyPath,
    autoIncrement: store.autoIncrement,
    indexes: [...store.indexNames].map((name) => savedIndex(store.index(name))),
    keys: structuredClone(keys),
    values: structuredClone(values),
  };
}

async function savedDatabase(
  win: Window,
  name: string,
): Promise<SavedDatabase> {
  const db = await opened(win.indexedDB.open(name));
  try {
    const names = [...db.objectStoreNames];
    if (names.length === 0) return { name, version: db.version, stores: [] };
    const tx = db.transaction(names, "readonly");
    const stores = await Promise.all(
      names.map((store) => savedStore(tx.objectStore(store))),
    );
    return { name, version: db.version, stores };
  } finally {
    db.close();
  }
}

async function databaseNames(win: Window): Promise<string[]> {
  const listed = await win.indexedDB.databases();
  return listed.flatMap(({ name }) => (name ? [name] : []));
}

async function savedDatabases(win: Window): Promise<SavedDatabase[]> {
  const names = await databaseNames(win);
  return Promise.all(names.map((name) => savedDatabase(win, name)));
}

export async function wipeDatabases(win: Window): Promise<void> {
  for (const name of await databaseNames(win)) {
    await opened(win.indexedDB.deleteDatabase(name) as IDBOpenDBRequest);
  }
}

function recreated(db: IDBDatabase, saved: SavedStore): void {
  const store = db.createObjectStore(saved.name, {
    keyPath: saved.keyPath,
    autoIncrement: saved.autoIncrement,
  });
  for (const { name, keyPath, unique, multiEntry } of saved.indexes) {
    store.createIndex(name, keyPath, { unique, multiEntry });
  }
  saved.values.forEach((value, at) => {
    if (saved.keyPath === null) store.put(value, saved.keys[at]);
    else store.put(value);
  });
}

async function restoreDatabase(
  win: Window,
  saved: SavedDatabase,
): Promise<void> {
  const request = win.indexedDB.open(saved.name, saved.version);
  request.onupgradeneeded = () => {
    for (const store of saved.stores) recreated(request.result, store);
  };
  const db = await opened(request);
  db.close();
}

// The landing page opens no database, but sends a device that finished
// onboarding into the app: its storage is held back until the page is up.
function atLanding(): Cypress.Chainable<Record<string, string>> {
  let local: Record<string, string> = {};
  return cy
    .visit("/", {
      onBeforeLoad(win) {
        local = { ...win.localStorage };
        win.localStorage.clear();
        win.sessionStorage.clear();
      },
    })
    .then(() => local);
}

function putAwayHeld(local: Record<string, string>): void {
  const device = holding;
  if (!device) return;
  cy.getCookies().then((cookies) =>
    cy
      .window()
      .then(savedDatabases)
      .then((databases) => {
        putAway.set(device, { local, databases, cookies });
      }),
  );
}

function pickUp(state: DeviceState): void {
  cy.clearCookies();
  for (const { name, value, path, expiry } of state.cookies) {
    cy.setCookie(name, value, { path, expiry });
  }
  cy.window().then(async (win) => {
    await wipeDatabases(win);
    for (const database of state.databases) {
      await restoreDatabase(win, database);
    }
    win.localStorage.clear();
    for (const [key, value] of Object.entries(state.local)) {
      win.localStorage.setItem(key, value);
    }
  });
}

/** Puts down the device in hand and picks up the named one, as it was left. A device
 * not picked up before in this test starts empty. */
export function onDevice(name: string): void {
  atLanding().then((local) => {
    putAwayHeld(local);
    cy.then(() => {
      pickUp(putAway.get(name) ?? EMPTY);
      holding = name;
    });
  });
}

/** Edits the device in hand's storage while nothing of the app runs. */
export function withAppClosed(
  edit: (win: Window) => void | Promise<void>,
): void {
  atLanding().then((local) =>
    cy.window().then((win) => {
      for (const [key, value] of Object.entries(local)) {
        win.localStorage.setItem(key, value);
      }
      return edit(win);
    }),
  );
}
