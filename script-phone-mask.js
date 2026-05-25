document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".lt-form").forEach((rootForm) => {
    (function init(formEl) {
      let n = formEl.querySelector("input[name='formParams[phone]']"), // phone
        l = formEl.querySelector("input[name='formParams[full_name]']"), // name
        i = formEl.querySelector("input[name='formParams[email]']"), // email
        a = formEl.querySelector("button[type='submit']"); // submit

      if (!n || !l || !i || !a) {
        console.warn("Form skipped due to missing elements:", formEl);
        return;
      }

      // --- error containers ---
      let r = {
        phone: document.createElement("div"),
        name: document.createElement("div"),
        email: document.createElement("div"),
      };
      r.phone.className = "error-message";
      r.name.className = "error-message";
      r.email.className = "error-message";
      n.parentNode.insertBefore(r.phone, n.nextSibling);
      l.parentNode.insertBefore(r.name, l.nextSibling);
      i.parentNode.insertBefore(r.email, i.nextSibling);

      // =========================
      //   HELPERS EMAIL – LOCAL
      // =========================
      const COMMON_DOMAINS = [
        "gmail.com",
        "yahoo.com",
        "outlook.com",
        "hotmail.com",
        "icloud.com",
        "proton.me",
        "aol.com",
        "yandex.com",
        "mail.ru",
        "yahoo.ro",
        "ymail.com",
        "mail.com",
      ];
      const COMMON_TLDS = [
        "com",
        "net",
        "org",
        "ro",
        "md",
        "me",
        "ru",
        "uk",
        "de",
        "fr",
        "it",
        "es",
        "io",
      ];

      function levenshtein(a, b) {
        const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
        for (let j = 1; j <= b.length; j++) m[0][j] = j;
        for (let x = 1; x <= a.length; x++) {
          for (let y = 1; y <= b.length; y++) {
            const c = a[x - 1] === b[y - 1] ? 0 : 1;
            m[x][y] = Math.min(
              m[x - 1][y] + 1,
              m[x][y - 1] + 1,
              m[x - 1][y - 1] + c,
            );
          }
        }
        return m[a.length][b.length];
      }

      // transpoziție adiacentă (ex: gmial ↔ gmail)
      function isAdjacentTransposition(a, b) {
        a = (a || "").toLowerCase();
        b = (b || "").toLowerCase();
        if (a.length !== b.length) return false;
        let diffs = [];
        for (let k = 0; k < a.length; k++) {
          if (a[k] !== b[k]) diffs.push(k);
          if (diffs.length > 2) return false;
        }
        if (diffs.length !== 2) return false;
        const [i1, i2] = diffs;
        if (i2 !== i1 + 1) return false; // doar litere vecine
        return a[i1] === b[i2] && a[i2] === b[i1];
      }

      function basicEmailFormatOK(email) {
        if (!email || typeof email !== "string") return false;
        if (/\s/.test(email)) return false;
        const parts = email.split("@");
        if (parts.length !== 2) return false; // exact 1 @
        const [local, domain] = parts;
        if (!local || !domain) return false;
        if (local.startsWith(".") || local.endsWith(".")) return false;
        if (domain.startsWith(".") || domain.endsWith(".")) return false;
        if (email.includes("..")) return false;
        if (!/^[A-Za-z0-9._%+\-]+$/.test(local)) return false;
        const labels = domain.split(".");
        if (labels.length < 2) return false;
        for (const label of labels) {
          if (!label) return false;
          if (!/^[A-Za-z0-9\-]+$/.test(label)) return false;
          if (label.startsWith("-") || label.endsWith("-")) return false;
        }
        const tld = labels[labels.length - 1];
        if (!/^[A-Za-z]{2,24}$/.test(tld)) return false;
        return true;
      }

      function suggestDomainFor(domainPart) {
        const input = (domainPart || "").toLowerCase();

        // typos frecvente -> gmail.com
        const GMAIL_TYPOS = new Set([
          "gamil.com",
          "gmial.com",
          "gmai.com",
          "gmail.co",
          "gmail.con",
          "gmaill.com",
          "gmal.com",
          "gmail.cpm",
          "gmaik.com",
          "gnail.com",
        ]);
        if (GMAIL_TYPOS.has(input)) return "gmail.com";

        // 1) corecție TLD la distanță 1
        const pieces = input.split(".");
        if (pieces.length >= 2) {
          const tld = pieces.pop();
          let bestTld = tld,
            bestDist = 99;
          for (const cand of COMMON_TLDS) {
            const d = levenshtein(tld, cand);
            if (d < bestDist) {
              bestDist = d;
              bestTld = cand;
            }
          }
          if (bestDist === 1) {
            pieces.push(bestTld);
            return pieces.join(".");
          }
          pieces.push(tld);
        }

        // 2) domenii populare: dist <= 1 sau transpoziție adiacentă
        let best = input,
          dist = 99,
          usedTransp = false;
        for (const dom of COMMON_DOMAINS) {
          const d = levenshtein(input, dom);
          const transp = isAdjacentTransposition(input, dom);
          if (d < dist || (transp && d <= 2)) {
            dist = d;
            best = dom;
            usedTransp = transp;
          }
        }
        if (dist <= 1 || usedTransp) return best !== input ? best : null;
        return null;
      }

      function emailCheckLocal(value) {
        const v = (value || "").trim();
        if (!v) return { ok: false, reason: "empty" };
        if (!basicEmailFormatOK(v)) return { ok: false, reason: "format" };
        const [local, domain] = v.split("@");
        const suggestionDom = suggestDomainFor(domain);
        if (suggestionDom)
          return {
            ok: false,
            reason: "typo",
            suggestion: local + "@" + suggestionDom,
          };
        return { ok: true };
      }

      // =========================
      //  PHONE / NAME (ca la tine)
      // =========================
      let placeholderCache = ""; // <-- DOAR AICI declarăm o singură dată
      function buildExample(e) {
        window.intlTelInputUtils &&
          setTimeout(() => {
            let c = e.getSelectedCountryData();
            let ex = intlTelInputUtils.getExampleNumber(
              c.iso2,
              true,
              intlTelInputUtils.numberFormat.INTERNATIONAL,
            );
            if (ex) {
              let norm = ex.replace(/\s/g, "");
              if (norm.startsWith("0")) norm = norm.substring(1);
              let maxLen = norm.replace(/\D/g, "").length;
              const overrides = { at: 10, de: 11, it: 11, gb: 11 };
              if (overrides[c.iso2])
                maxLen = Math.max(maxLen, overrides[c.iso2]);
              n.placeholder = norm.replace(
                /(\d{3})(\d{3})(\d{3,})/,
                "$1 $2 $3",
              );
              placeholderCache = n.placeholder;
              n.setAttribute("maxlength", maxLen);
            } else {
              setTimeout(() => buildExample(e), 100);
            }
          }, 100);
      }

      let itiInstance,
        d =
          ((itiInstance = intlTelInput(n, {
            initialCountry: "auto",
            separateDialCode: true,
            autoPlaceholder: "aggressive",
            preferredCountries: ["ro", "md"],
            geoIpLookup: function (cb) {
              fetch("https://ipapi.co/json")
                .then((res) => {
                  if (res.ok) return res.json();
                  throw Error("Failed to fetch country data");
                })
                .then((data) => cb(data.country_code))
                .catch(() => cb("ro"));
            },
            utilsScript:
              "https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js",
          })),
          n.addEventListener("countrychange", function () {
            buildExample(itiInstance);
          }),
          itiInstance);

      function validatePhone(show = true) {
        let ok = false;
        if (n.value.length === 0) {
          if (show) {
            r.phone.innerText = "Ups! Numărul de telefon lipsește.";
            r.phone.style.display = "block";
          }
        } else if (
          n.value.length <
          d.getSelectedCountryData().dialCode.length + 4
        ) {
          if (show) {
            r.phone.innerText = "Hopa! Numărul de telefon pare cam scurt!";
            r.phone.style.display = "block";
          }
        } else if (d.isValidNumber()) {
          r.phone.style.display = "none";
          ok = true;
        } else if (show) {
          r.phone.innerText =
            "Te rugăm să introduci un număr de telefon valid!";
          r.phone.style.display = "block";
        }
        return ok;
      }

      // =========================
      //   EMAIL – NOU (LOCAL)
      // =========================
      function validateEmail(show = true) {
        const res = emailCheckLocal(i.value);
        if (!res.ok) {
          if (!show) return false;
          if (res.reason === "empty") {
            r.email.innerText = "Ups! Ai uitat să ne dai adresa ta de email.";
          } else {
            r.email.innerText =
              "Hopa! Pare să fie o eroare în adresă, te rugăm să verifici.";
          }
          r.email.style.display = "block";
          return false;
        }

        // caz suplimentar: domeniu foarte apropiat de unul comun (ex: gamil/gmial ~ gmail)
        const domain = i.value.split("@")[1]?.toLowerCase() || "";
        const suggestion = suggestDomainFor(domain);
        if (suggestion && suggestion !== domain) {
          if (show) {
            r.email.innerText =
              "Hopa! Pare să fie o eroare în adresă, te rugăm să verifici.";
            r.email.style.display = "block";
          }
          return false;
        }

        r.email.style.display = "none";
        return true;
      }

      function validateName(show = true) {
        let ok = false;
        if (l.value.length === 0) {
          if (show) {
            r.name.innerText = "Ups! Ai uitat să ne spui cum te numești.";
            r.name.style.display = "block";
          }
        } else if (l.value.length < 2) {
          if (show) {
            r.name.innerText = "Hmm... Numele trebuie să aibă măcar 2 litere.";
            r.name.style.display = "block";
          }
        } else {
          r.name.style.display = "none";
          ok = true;
        }
        return ok;
      }

      function toggleSubmit() {
        const okPhone = validatePhone(false);
        const okEmail = validateEmail(false);
        const okName = validateName(false);
        a.disabled = !(okPhone && okEmail && okName);
      }

      // --- listeners ---
      n.addEventListener("input", function () {
        let digits = n.value.replace(/[^0-9]/g, "");
        n.value = digits;
        let c = d.getSelectedCountryData();
        if (c.iso2 === "ro" && digits.startsWith("0")) {
          r.phone.innerText = "Scrie numărul fără 0 de la început.";
          r.phone.style.display = "block";
        } else {
          r.phone.style.display = "none";
        }
        if (digits.length === 0) n.placeholder = placeholderCache;
        toggleSubmit();
      });

      n.addEventListener("blur", function () {
        validatePhone();
        toggleSubmit();
      });
      i.addEventListener("blur", function () {
        validateEmail();
        toggleSubmit();
      });
      l.addEventListener("blur", function () {
        validateName();
        toggleSubmit();
      });
      l.addEventListener("input", toggleSubmit);
      i.addEventListener("input", toggleSubmit);
      a.addEventListener("mouseenter", function () {
        toggleSubmit();
        validatePhone();
        validateEmail();
        validateName();
      });

      // la submit: normalizează telefonul; blochează dacă emailul e invalid
      formEl.addEventListener("submit", function (e) {
        const okP = validatePhone(true);
        const okE = validateEmail(true);
        const okN = validateName(true);
        if (!(okP && okE && okN)) {
          e.preventDefault();
          return;
        }
        n.value = d.getNumber(); // full E.164
      });

      // reîncarcă utils pentru iti
      let utils = document.createElement("script");
      utils.src =
        "https://cdn.jsdelivr.net/npm/intl-tel-input@18.2.1/build/js/utils.js";
      utils.onload = function () {
        let iv = setInterval(() => {
          if (d && window.intlTelInputUtils) {
            clearInterval(iv);
            buildExample(d);
          }
        }, 100);
      };
      document.body.appendChild(utils);
    })(rootForm);
  });
});
