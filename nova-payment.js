// ============================================================
//  KUMSKID NOVA AI — Flutterwave Payment Integration
//  Handles: Checkout, Webhooks, Subscription Management
//  Gateway: Flutterwave (Global — NGN + USD + other currencies)
// ============================================================

// ── Dependencies (Node.js backend) ───────────────────────────────────────
// npm install express flutterwave-node-v3 @supabase/supabase-js dotenv crypto

const express    = require('express');
const Flutterwave = require('flutterwave-node-v3');
const { createClient } = require('@supabase/supabase-js');
const crypto     = require('crypto');
const router     = express.Router();

// ── Environment Variables (.env file) ────────────────────────────────────
// FLW_PUBLIC_KEY=FLWPUBK_TEST-xxxxxxxxxxxxxxxxxxxxxxxx-X
// FLW_SECRET_KEY=FLWSECK_TEST-xxxxxxxxxxxxxxxxxxxxxxxx-X
// FLW_ENCRYPTION_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
// FLW_WEBHOOK_SECRET=your_webhook_secret_here
// SUPABASE_URL=https://yourproject.supabase.co
// SUPABASE_SERVICE_KEY=your_supabase_service_role_key
// APP_URL=https://kumskid-nova-ai.pages.dev

const flw = new Flutterwave(
  process.env.FLW_PUBLIC_KEY,
  process.env.FLW_SECRET_KEY
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Plan Configuration ────────────────────────────────────────────────────
const PLANS = {
  starter: {
    name:           'Starter Plan',
    amount_ngn:     15000,
    amount_usd:     15,
    max_bots:       1,
    max_messages:   500,
    description:    '1 Bot · 500 messages/month · Standard branding'
  },
  growth: {
    name:           'Growth Plan',
    amount_ngn:     40000,
    amount_usd:     39,
    max_bots:       2,
    max_messages:   3000,
    description:    '2 Bots · 3,000 messages/month · Custom branding + Lead CSV'
  },
  pro: {
    name:           'Pro / Elite Plan',
    amount_ngn:     100000,
    amount_usd:     99,
    max_bots:       999999,
    max_messages:   15000,
    description:    'Unlimited Bots · 15,000 messages/month · Full white-label'
  }
};

// ── Currency detection helper ─────────────────────────────────────────────
function getCurrencyForCountry(country) {
  const ngnCountries = ['NG', 'Nigeria'];
  return ngnCountries.includes(country) ? 'NGN' : 'USD';
}

function getPlanAmount(planSlug, currency) {
  const plan = PLANS[planSlug];
  return currency === 'NGN' ? plan.amount_ngn : plan.amount_usd;
}


// ════════════════════════════════════════════════════════════
// ROUTE 1: Initiate Payment / Checkout
// POST /api/payments/initiate
// Body: { userId, planSlug, userEmail, userName, userPhone, country }
// ════════════════════════════════════════════════════════════
router.post('/initiate', async (req, res) => {
  try {
    const { userId, planSlug, userEmail, userName, userPhone, country } = req.body;

    if (!userId || !planSlug || !userEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const plan     = PLANS[planSlug];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    const currency = getCurrencyForCountry(country || 'NG');
    const amount   = getPlanAmount(planSlug, currency);

    // Generate unique transaction reference
    const txRef = `nova_${userId}_${planSlug}_${Date.now()}`;

    // Save pending transaction to Supabase
    await supabase.from('payment_transactions').insert({
      user_id:    userId,
      tx_ref:     txRef,
      plan_tier:  planSlug,
      amount:     amount,
      currency:   currency,
      status:     'pending'
    });

    // Build Flutterwave payment payload
    const paymentPayload = {
      tx_ref:       txRef,
      amount:       amount,
      currency:     currency,
      redirect_url: `${process.env.APP_URL}/payment/callback`,
      customer: {
        email:       userEmail,
        phonenumber: userPhone || '',
        name:        userName  || userEmail
      },
      customizations: {
        title:       'KUMSKID Nova AI',
        description: plan.description,
        logo:        `${process.env.APP_URL}/logo.png`
      },
      meta: {
        user_id:   userId,
        plan_slug: planSlug
      },
      payment_options: 'card,banktransfer,ussd,mobilemoney'
      // ↑ accepts cards, bank transfers, USSD, and mobile money globally
    };

    // Create payment link via Flutterwave
    const response = await flw.Charge.card(paymentPayload);

    // For hosted payment page use Standard charge
    const hostedResponse = await flw.Payment.create(paymentPayload);

    res.json({
      success:      true,
      payment_link: hostedResponse.data.link,
      tx_ref:       txRef
    });

  } catch (error) {
    console.error('Payment initiation error:', error);
    res.status(500).json({ error: 'Payment initiation failed', details: error.message });
  }
});


// ════════════════════════════════════════════════════════════
// ROUTE 2: Payment Callback (After user pays)
// GET /api/payments/callback?tx_ref=...&transaction_id=...&status=...
// Flutterwave redirects here after payment
// ════════════════════════════════════════════════════════════
router.get('/callback', async (req, res) => {
  try {
    const { tx_ref, transaction_id, status } = req.query;

    if (status === 'cancelled') {
      return res.redirect(`${process.env.APP_URL}/dashboard?payment=cancelled`);
    }

    if (status !== 'successful') {
      return res.redirect(`${process.env.APP_URL}/dashboard?payment=failed`);
    }

    // Verify the transaction with Flutterwave
    const verification = await flw.Transaction.verify({ id: transaction_id });

    if (
      verification.data.status   !== 'successful' ||
      verification.data.tx_ref   !== tx_ref
    ) {
      return res.redirect(`${process.env.APP_URL}/dashboard?payment=failed`);
    }

    // Get the pending transaction from DB
    const { data: pendingTx } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('tx_ref', tx_ref)
      .single();

    if (!pendingTx) {
      return res.redirect(`${process.env.APP_URL}/dashboard?payment=failed`);
    }

    // Verify amount matches
    const expectedAmount = getPlanAmount(pendingTx.plan_tier, verification.data.currency);
    if (Number(verification.data.amount) < expectedAmount) {
      return res.redirect(`${process.env.APP_URL}/dashboard?payment=failed&reason=amount_mismatch`);
    }

    // Activate subscription
    await activateSubscription(
      pendingTx.user_id,
      pendingTx.plan_tier,
      transaction_id,
      verification.data
    );

    res.redirect(`${process.env.APP_URL}/dashboard?payment=success&plan=${pendingTx.plan_tier}`);

  } catch (error) {
    console.error('Payment callback error:', error);
    res.redirect(`${process.env.APP_URL}/dashboard?payment=error`);
  }
});


// ════════════════════════════════════════════════════════════
// ROUTE 3: Flutterwave Webhook
// POST /api/payments/webhook
// Flutterwave calls this for recurring events automatically
// ════════════════════════════════════════════════════════════
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook signature
    const flwSignature = req.headers['verif-hash'];
    if (flwSignature !== process.env.FLW_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(req.body);
    console.log('Flutterwave Webhook Event:', event.event);

    switch (event.event) {

      case 'charge.completed':
        // Payment completed successfully
        if (event.data.status === 'successful') {
          const meta = event.data.meta || {};
          if (meta.user_id && meta.plan_slug) {
            await activateSubscription(
              meta.user_id,
              meta.plan_slug,
              event.data.id,
              event.data
            );
          }
        }
        break;

      case 'subscription.cancelled':
        // User cancelled subscription
        await cancelSubscription(event.data.customer.email);
        break;

      case 'payment.failed':
        // Payment failed — mark as past_due
        await markSubscriptionPastDue(event.data.meta?.user_id);
        break;

      default:
        console.log('Unhandled webhook event:', event.event);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});


// ════════════════════════════════════════════════════════════
// ROUTE 4: Check Payment Status
// GET /api/payments/status/:txRef
// ════════════════════════════════════════════════════════════
router.get('/status/:txRef', async (req, res) => {
  try {
    const { data } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('tx_ref', req.params.txRef)
      .single();

    res.json({ success: true, transaction: data });
  } catch (error) {
    res.status(500).json({ error: 'Status check failed' });
  }
});


// ════════════════════════════════════════════════════════════
// ROUTE 5: Cancel Subscription
// POST /api/payments/cancel
// Body: { userId }
// ════════════════════════════════════════════════════════════
router.post('/cancel', async (req, res) => {
  try {
    const { userId } = req.body;

    await supabase
      .from('subscriptions')
      .update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('status', 'active');

    res.json({ success: true, message: 'Subscription will cancel at period end' });
  } catch (error) {
    res.status(500).json({ error: 'Cancellation failed' });
  }
});


// ════════════════════════════════════════════════════════════
// HELPER: activateSubscription
// Called after successful payment — creates/updates subscription
// ════════════════════════════════════════════════════════════
async function activateSubscription(userId, planSlug, transactionId, txData) {
  const now        = new Date();
  const periodEnd  = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1); // +1 month

  // Upsert subscription (create or update)
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id:              userId,
      plan_tier:            planSlug,
      status:               'active',
      price_usd:            txData.currency === 'USD' ? txData.amount : null,
      price_ngn:            txData.currency === 'NGN' ? txData.amount : null,
      currency:             txData.currency,
      payment_gateway:      'flutterwave',
      gateway_sub_id:       String(transactionId),
      gateway_customer_id:  txData.customer?.email,
      current_period_start: now.toISOString(),
      current_period_end:   periodEnd.toISOString(),
      cancel_at_period_end: false,
      updated_at:           now.toISOString()
    }, { onConflict: 'user_id' });

  if (error) throw error;

  // Update payment transaction status
  await supabase
    .from('payment_transactions')
    .update({ status: 'completed', flw_transaction_id: transactionId })
    .eq('user_id', userId)
    .eq('status', 'pending');

  // Re-enable all bots for this user (in case they were blocked)
  await supabase
    .from('chatbots')
    .update({ is_active: true })
    .eq('user_id', userId);

  console.log(`✅ Subscription activated: user=${userId} plan=${planSlug}`);
}


// ════════════════════════════════════════════════════════════
// HELPER: cancelSubscription
// ════════════════════════════════════════════════════════════
async function cancelSubscription(userEmail) {
  // Get user by email
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', userEmail)
    .single();

  if (!user) return;

  await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  // Deactivate all bots
  await supabase
    .from('chatbots')
    .update({ is_active: false })
    .eq('user_id', user.id);

  console.log(`❌ Subscription cancelled: user=${user.id}`);
}


// ════════════════════════════════════════════════════════════
// HELPER: markSubscriptionPastDue
// ════════════════════════════════════════════════════════════
async function markSubscriptionPastDue(userId) {
  if (!userId) return;

  await supabase
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  console.log(`⚠️ Subscription past_due: user=${userId}`);
}


// ════════════════════════════════════════════════════════════
// CRON JOB: Check expired subscriptions daily
// Run this with node-cron or a Supabase Edge Function
// Schedule: every day at midnight
// ════════════════════════════════════════════════════════════
async function checkExpiredSubscriptions() {
  console.log('🔄 Checking expired subscriptions...');

  const now = new Date().toISOString();

  // Find all subscriptions past their period end
  const { data: expired } = await supabase
    .from('subscriptions')
    .select('user_id, plan_tier, cancel_at_period_end')
    .eq('status', 'active')
    .lt('current_period_end', now);

  for (const sub of (expired || [])) {
    if (sub.cancel_at_period_end) {
      // Fully cancel
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', sub.user_id);

      // Disable their bots
      await supabase
        .from('chatbots')
        .update({ is_active: false })
        .eq('user_id', sub.user_id);

      console.log(`Bot disabled for expired user: ${sub.user_id}`);
    } else {
      // Mark past_due — they still have access temporarily
      await supabase
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('user_id', sub.user_id);
    }
  }

  console.log(`✅ Checked ${(expired || []).length} expired subscriptions`);
}

// Export for use in cron scheduler
module.exports.checkExpiredSubscriptions = checkExpiredSubscriptions;


// ════════════════════════════════════════════════════════════
// MIDDLEWARE: Subscription Gate
// Use this on any API route that requires an active subscription
// e.g. router.post('/chat', checkSubscription, handleChat)
// ════════════════════════════════════════════════════════════
async function checkSubscription(req, res, next) {
  try {
    const userId = req.user?.id; // assumes auth middleware ran first
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, plan_tier, current_period_end')
      .eq('user_id', userId)
      .single();

    if (!sub || sub.status === 'cancelled') {
      return res.status(403).json({
        error: 'No active subscription',
        code:  'SUBSCRIPTION_REQUIRED',
        redirect: '/billing'
      });
    }

    if (sub.status === 'past_due') {
      return res.status(402).json({
        error: 'Payment overdue',
        code:  'PAYMENT_REQUIRED',
        redirect: '/billing?action=renew'
      });
    }

    // Attach plan info to request
    req.subscription = sub;
    req.planLimits   = PLANS[sub.plan_tier];
    next();

  } catch (error) {
    res.status(500).json({ error: 'Subscription check failed' });
  }
}

module.exports = router;
module.exports.checkSubscription = checkSubscription;
module.exports.PLANS = PLANS;


// ════════════════════════════════════════════════════════════
// EXTRA SQL: payment_transactions table
// Add this to your Supabase schema
// ════════════════════════════════════════════════════════════
/*
CREATE TABLE payment_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tx_ref                VARCHAR(255) UNIQUE NOT NULL,
  flw_transaction_id    VARCHAR(255),
  plan_tier             VARCHAR(50) NOT NULL,
  amount                NUMERIC(12,2) NOT NULL,
  currency              VARCHAR(10) NOT NULL,
  status                VARCHAR(20) DEFAULT 'pending',
                        -- pending | completed | failed | refunded
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_transactions_user   ON payment_transactions(user_id);
CREATE INDEX idx_transactions_tx_ref ON payment_transactions(tx_ref);
CREATE INDEX idx_transactions_status ON payment_transactions(status);
*/
