/**
 * Inline payment popups — Paystack + Flutterwave.
 *
 * HARD REQUIREMENT: the checkout must open as an in-app popup/modal. We never
 * navigate away and never pass a redirect_url. Inside a Capacitor webview a
 * redirect can dump the user into the system browser with no route back into
 * the app, and the payment result would be lost.
 *
 * Trust model: the popup's success callback is a HINT. It tells us to go ask
 * our own server to verify with the provider. Entitlement is granted only by
 * `POST /api/payments/verify`, never by anything the popup hands us — that
 * callback is forgeable from a browser console.
 */

const SDK = {
  paystack: { url: 'https://js.paystack.co/v2/inline.js', global: 'PaystackPop' },
  flutterwave: { url: 'https://checkout.flutterwave.com/v3.js', global: 'FlutterwaveCheckout' },
}

const loading = new Map()

/** Load a provider SDK once, memoised, with a timeout so we never hang. */
function loadSdk(provider) {
  const spec = SDK[provider]
  if (!spec) return Promise.reject(new Error(`Unknown payment provider: ${provider}`))
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window[spec.global]) return Promise.resolve(window[spec.global])
  if (loading.has(provider)) return loading.get(provider)

  const p = new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = spec.url
    el.async = true
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error("Couldn't reach the payment provider. Check your connection."))
    }, 15000)
    const cleanup = () => { clearTimeout(timer); el.onload = null; el.onerror = null }

    el.onload = () => {
      cleanup()
      window[spec.global]
        ? resolve(window[spec.global])
        : reject(new Error('Payment library loaded but is unavailable.'))
    }
    el.onerror = () => {
      cleanup()
      loading.delete(provider)   // allow a retry on the next attempt
      el.remove()
      reject(new Error("Couldn't load the payment window. Check your connection."))
    }
    document.head.appendChild(el)
  })

  loading.set(provider, p)
  return p
}

/** Preload the SDK so the popup opens instantly when the user taps Pay. */
export function preloadPaymentSdk(provider = 'paystack') {
  loadSdk(provider).catch(() => {})
}

/**
 * Open the checkout popup.
 *
 * @returns {Promise<{status:'success'|'cancelled', reference?:string}>}
 *          Resolves on cancel too — an abandoned payment is a normal outcome,
 *          not an error, and shouldn't surface a scary message.
 */
export async function openCheckout(intent) {
  const { provider, publicKey, reference, email, amount, amountMajor, currency, plan } = intent

  if (provider === 'flutterwave') {
    const FlutterwaveCheckout = await loadSdk('flutterwave')
    return new Promise((resolve, reject) => {
      let settled = false
      let modal = null
      const done = (v) => { if (!settled) { settled = true; resolve(v) } }
      try {
        modal = FlutterwaveCheckout({
          public_key: publicKey,
          tx_ref: reference,
          amount: amountMajor,          // Flutterwave uses major units (naira)
          currency,
          // NO redirect_url on purpose — that would leave the app.
          payment_options: 'card,banktransfer,ussd',
          customer: { email },
          customizations: {
            title: 'Leenk+',
            description: plan?.label ? `Leenk+ · ${plan.label}` : 'Leenk+ subscription',
          },
          callback: (payment) => {
            modal?.close?.()
            done({ status: 'success', reference: payment?.tx_ref || reference })
          },
          onclose: () => done({ status: 'cancelled' }),
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  // Paystack InlineJS v2
  const PaystackPop = await loadSdk('paystack')
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (v) => { if (!settled) { settled = true; resolve(v) } }
    try {
      const popup = new PaystackPop()
      popup.newTransaction({
        key: publicKey,
        email,
        amount,                       // Paystack uses kobo
        currency,
        reference,
        metadata: { planId: plan?.id, custom_fields: [] },
        onSuccess: (tx) => done({ status: 'success', reference: tx?.reference || reference }),
        onCancel: () => done({ status: 'cancelled' }),
        onError: (err) => {
          if (settled) return
          settled = true
          reject(new Error(err?.message || 'The payment window failed to open.'))
        },
      })
    } catch (err) {
      reject(err)
    }
  })
}
