import {
  BETA_FEATURES,
  BETA_STORAGE_KEY,
  readBeta,
  setBeta,
  subscribeToBeta,
} from "@/lib/beta";

/**
 * The tests here run in Node, like the rest of them — this project has
 * no jsdom and does not need one for a module whose whole surface is
 * two globals. A dependency the size of a browser, to test six lines
 * that read a string and dispatch an event, is not a trade worth
 * making.
 *
 * So the two globals are stood up: a Map behind the localStorage API,
 * and an EventTarget behind window's. Both are what beta.ts actually
 * uses, and nothing here pretends to be more of a browser than that.
 */
function stubBrowser() {
  const store = new Map<string, string>();
  const target = new EventTarget();

  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
    window: {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    },
  });

  return { store, target };
}

describe("the beta switch", () => {
  let browser: ReturnType<typeof stubBrowser>;
  beforeEach(() => {
    browser = stubBrowser();
  });

  it("is off until somebody asks for it", () => {
    expect(readBeta()).toBe(false);
  });

  it("remembers being turned on", () => {
    setBeta(true);
    expect(readBeta()).toBe(true);
  });

  it("forgets rather than storing an off, so the default can change", () => {
    setBeta(true);
    setBeta(false);
    expect(readBeta()).toBe(false);
    expect(browser.store.has(BETA_STORAGE_KEY)).toBe(false);
  });

  it("treats anything it did not write as off", () => {
    // A stale key from a previous shape of this setting must not read
    // as an opt-in to whatever is unfinished today.
    browser.store.set(BETA_STORAGE_KEY, "true");
    expect(readBeta()).toBe(false);
  });

  it("tells this tab about a change, and stops when unsubscribed", () => {
    const heard = jest.fn();
    const stop = subscribeToBeta(heard);

    setBeta(true);
    expect(heard).toHaveBeenCalledTimes(1);

    stop();
    setBeta(false);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("tells this tab about a change made in another one", () => {
    // `storage` fires only in the tabs that did not do the writing,
    // which is why both it and the custom event are listened for.
    const heard = jest.fn();
    const stop = subscribeToBeta(heard);

    browser.target.dispatchEvent(new Event("storage"));
    expect(heard).toHaveBeenCalledTimes(1);

    stop();
  });

  it("names what it turns on", () => {
    // A switch labelled "Beta" that says nothing is a switch nobody
    // presses, so the list is not allowed to be empty while the switch
    // exists.
    expect(BETA_FEATURES.length).toBeGreaterThan(0);
    for (const feature of BETA_FEATURES) {
      expect(feature.name).not.toBe("");
      expect(feature.hint.length).toBeGreaterThan(10);
    }
  });
});
