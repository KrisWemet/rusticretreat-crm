// Event Venue Rental Agreement — 2027 pricing.
//
// Transcribed from the venue's own 15-page PDF (2027_Wedding_Contract_TEMPLATE).
// The wording is the owner's and is reproduced verbatim; only the *structure*
// is ours. See schema.md for the block vocabulary.
//
// Twelve `initials` blocks appear at exactly the points the paper contract asks
// for them, and both clients must initial every one. Do not add, remove or
// renumber them without the owner's say-so: each sits against a specific clause
// they chose to have separately acknowledged.

const VENUE = 'venue';
const CLIENT = 'client';

module.exports = {
  key: 'rental-agreement-2027',
  version: 1,
  title: 'Event Venue Rental Agreement',
  subtitle: '2027 Pricing · Rates subject to change in 2028',

  // Shown on the first page above section 1.
  preamble:
    'This legally binding Agreement is entered into as of the date signed below, ' +
    'between Rustic Retreat Weddings & Events Ltd. (the “Venue”) and the Client(s) ' +
    'named herein. Shannon Ouimet acts as signing authority on behalf of the ' +
    'corporation. References to “the Venue” in this Agreement refer to the ' +
    'corporation and not to any individual personally. By signing, both parties ' +
    'agree to all terms, conditions, and attached Schedules.',

  venueBlock: {
    name: 'Rustic Retreat Weddings & Events Ltd.',
    signatory: 'Shannon Ouimet, Venue Coordinator',
    email: 'rusticretreatalberta@gmail.com',
    phone: '(780)210-6252',
    physicalAddress: '3121 Township Road 572A, Lac Ste. Anne County, Alberta',
    mailingAddress: 'RR1, Site 6, Comp 15, Gunn, Alberta T0E-1A0',
  },

  sections: [
    // ─── 1. PARTIES ──────────────────────────────────────────────────────────
    {
      id: '1',
      blocks: [
        { t: 'h1', text: '1. PARTIES TO THIS AGREEMENT' },
        { t: 'h2', text: 'Venue' },
        { t: 'p', text: 'Rustic Retreat Weddings & Events Ltd.  ·  Shannon Ouimet, Venue Coordinator  ·  rusticretreatalberta@gmail.com  ·  (780)210-6252' },
        // Filled by the VENUE, not the couple. The contract cannot be sent
        // without knowing who to send it to, and the signing chain already
        // refuses to lock a contract until both partners' addresses are on
        // file — so asking the couple for them was circular.
        //
        // Names and emails are required because the signing links depend on
        // them. Phone and postal address are not: the venue often does not have
        // them when the booking is made, and a missing postal code must never
        // block a wedding. Blank optional fields print as a ruled line, exactly
        // as they do on the paper contract.
        { t: 'h2', text: 'Client Details' },
        { t: 'fields', cols: 2, items: [
          { key: 'client1_name',  label: 'CLIENT 1: FULL NAME', type: 'text',  fill: VENUE, required: true },
          { key: 'client2_name',  label: 'CLIENT 2: FULL NAME', type: 'text',  fill: VENUE, required: true },
          { key: 'client1_phone', label: 'CLIENT 1: PHONE',     type: 'tel',   fill: VENUE, required: false },
          { key: 'client2_phone', label: 'CLIENT 2: PHONE',     type: 'tel',   fill: VENUE, required: false },
          { key: 'client1_email', label: 'CLIENT 1: EMAIL',     type: 'email', fill: VENUE, required: true },
          { key: 'client2_email', label: 'CLIENT 2: EMAIL',     type: 'email', fill: VENUE, required: true },
        ]},
        { t: 'fields', cols: 1, items: [
          { key: 'mailing_address', label: 'MAILING ADDRESS', type: 'text', fill: VENUE, required: false },
        ]},
        { t: 'fields', cols: 3, items: [
          { key: 'city',        label: 'CITY',        type: 'text', fill: VENUE, required: false },
          { key: 'province',    label: 'PROVINCE',    type: 'text', fill: VENUE, required: false },
          { key: 'postal_code', label: 'POSTAL CODE', type: 'text', fill: VENUE, required: false },
        ]},
        { t: 'fields', cols: 2, items: [
          { key: 'agreement_date', label: 'AGREEMENT DATE',      type: 'date', fill: VENUE, required: true },
          { key: 'event_date',     label: 'WEDDING / EVENT DATE', type: 'date', fill: VENUE, required: true },
        ]},
      ],
    },

    // ─── 2. EVENT DETAILS ────────────────────────────────────────────────────
    {
      id: '2',
      blocks: [
        { t: 'h1', text: '2. EVENT DETAILS' },
        { t: 'h2', text: '2.1 Access & Check-In / Check-Out' },
        { t: 'fields', cols: 3, items: [
          { key: 'event_type', label: 'EVENT TYPE', type: 'select', fill: VENUE, required: true,
            options: ['Wedding', 'Elopement', 'Vow Renewal', 'Anniversary', 'Corporate Retreat', 'Other Celebration'] },
          { key: 'setup_date',    label: 'SETUP / ACCESS', type: 'date', fill: VENUE, required: true },
          { key: 'teardown_date', label: 'TEARDOWN BY',    type: 'date', fill: VENUE, required: true },
        ]},
        { t: 'fields', cols: 3, items: [
          { key: '_spacer_21',    label: '', type: 'spacer', fill: VENUE },
          { key: 'setup_time',    label: 'SETUP TIME',    type: 'time', fill: VENUE, required: true },
          { key: 'teardown_time', label: 'TEARDOWN TIME', type: 'time', fill: VENUE, required: true },
        ]},

        { t: 'h2', text: '2.2 On-Site Contacts' },
        { t: 'p', text: 'Please designate at least two trusted individuals who will serve as your on-site points of contact on the day of your wedding. These are the people our team will reach out to should any questions or situations arise - so you can stay present in your moment, completely free from logistics. Choose people who are calm under pressure, know your vision, and are empowered to make decisions on your behalf.' },
        { t: 'fields', cols: 3, label: 'On-site Contact 1', items: [
          { key: 'onsite1_relationship', label: 'RELATIONSHIP / ROLE', type: 'text', fill: CLIENT, required: true },
          { key: 'onsite1_name',         label: 'NAME',                type: 'text', fill: CLIENT, required: true },
          { key: 'onsite1_phone',        label: 'PHONE NUMBER',        type: 'tel',  fill: CLIENT, required: true },
        ]},
        { t: 'fields', cols: 3, label: 'On-site Contact 2', items: [
          { key: 'onsite2_relationship', label: 'RELATIONSHIP / ROLE', type: 'text', fill: CLIENT, required: true },
          { key: 'onsite2_name',         label: 'NAME',                type: 'text', fill: CLIENT, required: true },
          { key: 'onsite2_phone',        label: 'PHONE NUMBER',        type: 'tel',  fill: CLIENT, required: true },
        ]},

        { t: 'h2', text: '2.3 Guest Capacity & Overage Fees' },
        { t: 'table',
          head: ['Category', 'Included', 'Max Overage Fee', 'Hard Cap'],
          rows: [
            ['Ceremony & Reception', '80 guests', '$25 / additional guest', '100 guests†'],
            ['Overnight Camping (guests)', '60 guests', 'See tent & RV fees below', '100 guests†'],
            ['Tents', '12 tents', '$25 / additional tent per night', 'No hard cap‡'],
            ['RVs on Property', '8 RVs', '$35 / additional RV per night', '15 RVs total'],
          ],
        },
        { t: 'p', small: true, text: '† Total guests on the property, including both ceremony/reception and overnight camping, cannot exceed 100 at any time.  ‡ No hard cap on tents; all tent counts must be submitted on the Final Details Form by the 7-day deadline.' },
        { t: 'h3', text: 'Ceremony & Reception Overages' },
        { t: 'p', text: 'Clients expecting more than 80 guests must obtain prior written approval from the Venue. A flat fee of $25 applies to each guest above 80, up to the hard cap of 100.' },
        { t: 'h3', text: 'Overnight Camping Overages' },
        { t: 'p', text: 'The included overnight camping allocation covers up to 60 guests, 12 tents, and 8 RVs. Overage fees apply to any tents or RVs beyond the included allocation and are charged per unit, per night. There is no per-person overnight overage fee: the nightly rates reflect the additional impact on the property from vehicle and foot traffic, as well as the increased operating costs associated with hosting a larger overnight group.' },
        { t: 'h3', text: 'Tent-to-RV Conversion' },
        { t: 'p', text: 'If your group will use fewer tents than the included 12, unused tent slots may be converted to additional included RV slots at a ratio of 3 unused tent slots per 1 additional RV. Clients calculate their conversion on the Final Details Form and submit it at the 7-day mark. The Venue will review the submission for accuracy and confirm the final allocation in writing. This conversion is locked in at the 7-day submission and cannot be revised.' },
        { t: 'list', items: [
          'Example 1: 6 tents used (6 unused slots) → 2 additional included RVs → included RV total becomes 10 before overage fees apply.',
          'Example 2: 0 tents used (12 unused slots) → 4 additional included RVs → included RV total becomes 12, the maximum possible under conversion.',
        ]},
        { t: 'h3', text: 'Submission & Payment Timeline' },
        { t: 'list', items: [
          '7 days before check-in: Complete and submit the Final Details Form to rusticretreatalberta@gmail.com no later than 7 days before check-in. This form captures your finalized guest, tent, and RV counts and any tent-to-RV conversion, and is locked in at submission and cannot be revised. The Venue will review for accuracy and issue an overage invoice if applicable, and all overage fees must be paid in full by this same date. No overage guests, tents, or RVs will be permitted on the property if outstanding fees remain unpaid at check-in.',
        ]},
        { t: 'h3', text: 'No Refunds on Downward Adjustments' },
        { t: 'p', text: 'Overage fees paid are non-refundable regardless of final counts. Submitted counts are used by the Venue to plan staffing, resources, and property preparation from the 7-day mark forward.' },
        { t: 'p', text: 'Note for Clients bringing RVs over 30 feet: an alternate exit route is required due to road clearance constraints. Please refer to Schedule A, Sections 3 and 4 for routing details.' },
        { t: 'p', text: 'Please note: Rustic Retreat’s picnic tables and ceremony benches are sized to comfortably accommodate up to 80 guests. Couples planning to host more than 80 guests should be aware that the Venue’s standard seating inventory may not be sufficient for all attendees. The sourcing, rental, delivery, and setup of any additional tables, chairs, or seating required for overage guests is the sole responsibility of the Client. The Venue does not provide supplementary seating and assumes no liability for any inconvenience arising from insufficient seating arrangements. Please also note that total guests on the property, including both ceremony/reception and overnight camping, cannot exceed 100 at any time.' },
        { t: 'initials', key: 'capacity_seating', label: 'Guest capacity, overages and seating (Section 2.3)' },
        { t: 'p', text: 'This package includes up to 80 guests for the ceremony & reception, up to 60 overnight camping guests, up to 12 tents, and up to 8 RVs, as set out in the Guest Capacity & Overage Fees table above. Any additional guests, tents, or RVs beyond these included amounts are subject to the overage fees and submission process described in this Section 2.3.' },

        { t: 'h2', text: '2.4 Weather Contingency & Outdoor Event Planning' },
        { t: 'p', text: 'The Venue provides the Gazebo as the sole covered venue structure on the property. The Gazebo is available for use during all booked packages and may serve as a sheltered area during inclement weather. The Venue makes no representations or guarantees regarding weather conditions during the Client’s event. Rustic Retreat is an outdoor rural property and events are designed to operate in the natural environment.' },
        { t: 'p', text: 'The Client is solely responsible for planning, arranging, and executing any weather contingency or backup plan for portions of their event that take place outside of the Gazebo. This includes but is not limited to:' },
        { t: 'list', items: [
          'Renting and arranging delivery of tents, canopies, or temporary structures for outdoor ceremony or reception areas if required',
          'Coordinating alternative indoor or covered spaces for guests if required',
          'Ensuring any rented structures comply with fire safety regulations and do not block emergency access lanes',
          'Advising the Venue in writing of any temporary structures to be installed on the property at least 5 days prior to check-in.',
        ]},
        { t: 'p', text: 'Proposed placement of all temporary structures must be approved by the Venue prior to check-in. Temporary structures may not be installed before the Client’s check-in time, and the Client or their designated on-site contact must be present on-site to coordinate the vendor and direct placement of all structures. The Venue assumes no responsibility for any weather-related disruption, loss, or expense incurred by the Client or their guests. No refund or credit will be issued due to weather conditions.' },
        { t: 'initials', key: 'weather', label: 'Weather contingency (Section 2.4)' },

        { t: 'h2', text: '2.5 Day-Of Timeline & Final Details Form' },
        { t: 'p', text: 'The Client agrees to provide the Venue with a day-of timeline for their event, to assist the Venue in planning and preparing ahead of the Client’s check-in. The day-of timeline must be submitted together with the Venue’s Final Details Form, which will be sent to the Client in advance of their event date and is due no later than 7 days before check-in.' },
        { t: 'initials', key: 'timeline', label: 'Day-of timeline & Final Details Form (Section 2.5)' },
      ],
    },

    // ─── 3. PACKAGE SELECTION ────────────────────────────────────────────────
    {
      id: '3',
      blocks: [
        { t: 'h1', text: '3. PACKAGE SELECTION' },
        { t: 'choice', key: 'package', fill: VENUE, required: true, layout: 'table',
          label: 'Package',
          columns: ['Package', '2027 Price', 'Duration'],
          options: [
            { value: '2-day',  cells: ['2-Day (Weekday only)', '$3,000', '2 days / 1 night'] },
            { value: '3-day',  cells: ['3-Day Weekend',        '$6,500', '3 days / 2 nights'] },
            { value: '5-day',  cells: ['5-Day Weekend',        '$7,500', '5 days / 4 nights'] },
          ],
        },
        { t: 'p', text: 'All packages include: Cabin, Gazebo, Picnic Tables, Ceremony Benches, self-serve Décor Shed, and all standard amenities. Clients are responsible for all setup and cleanup.' },
        { t: 'p', text: 'The Décor Shed is a self-serve space containing a variety of decorative items available for Client use at no charge. Items must be returned clean and to their original bins by check-out. Any damaged or missing items must be reported to the Venue Coordinator at check-out. Clients wishing to contribute items to the Décor Shed are welcome to discuss this with the Venue Coordinator - items cannot be added without prior approval, as all items require inventory registration, labelling, and bin assignment. Items with associated rental fees (consumables and select rental items) are managed separately and are not stored in the self-serve shed. These are consumable items such as wax candles, batteries, ect.' },
      ],
    },

    // ─── 4. PAYMENT TERMS ────────────────────────────────────────────────────
    {
      id: '4',
      blocks: [
        { t: 'h1', text: '4. PAYMENT TERMS' },
        { t: 'fields', cols: 2, items: [
          { key: 'total_package_fee', label: 'TOTAL PACKAGE FEE (INCLUDING GST / EXCL. OVERAGES)', type: 'money', fill: VENUE, required: true },
          { key: 'damage_deposit',    label: 'DAMAGE DEPOSIT (DUE AT CHECK-IN)',                   type: 'money', fill: VENUE, required: true, default: '1000.00' },
        ]},
        { t: 'paymentSchedule' },
        { t: 'note', text: 'Your dates are NOT confirmed until all documentation is signed and the initial deposit is received.' },
        { t: 'h2', text: '4.1 Payment Methods' },
        { t: 'list', items: ['e-Transfer: rusticretreatalberta@gmail.com'] },
        { t: 'h2', text: '4.2 Damage Deposit' },
        { t: 'p', text: 'The $1,000 damage deposit is due at check-in and is fully refundable, subject to a post-event inspection within 48 hours of check-out. Deductions may be made for damage, missing items, excessive cleaning, non-emergency fire extinguisher discharge, or unauthorized tree cutting or removal (see Section 7.5).' },

        { t: 'h2', text: '4.3 Cancellation Policy' },
        { t: 'p', text: 'Rustic Retreat is a private, small-capacity venue that hosts one event per week. Unlike multi-space event facilities that can absorb a late cancellation by filling the date with another booking, Rustic Retreat reserves your dates exclusively - meaning that when a booking is made, all other inquiries for those dates are declined. A cancellation at any stage represents a complete loss of revenue for that booking window, and the realistic opportunity to rebook the same dates on short notice is extremely limited. Our cancellation policy is structured to reflect this reality fairly and transparently. The tiered refund schedule below is designed to balance the Client’s interests with the Venue’s need to protect its limited booking calendar. Clients are strongly encouraged to consider event cancellation or wedding insurance to protect their investment against unforeseen circumstances. The cancellation policy applies regardless of the reason for cancellation, including personal, medical, or family circumstances.' },
        { t: 'table',
          head: ['Notice Given', 'Refund'],
          rows: [
            ['120+ days before check-in', 'Full refund minus non-refundable deposit'],
            ['90–120 days before check-in', '50% refund of balance paid above non-refundable deposit'],
            ['Less than 90 days before check-in', 'No refund'],
          ],
        },
        { t: 'p', text: 'To initiate a cancellation, the Client must submit a written request to rusticretreatalberta@gmail.com. Upon receipt of the request, the Venue will provide the Client with the official Rustic Retreat Cancellation Form. The cancellation is not considered valid or in effect until the completed Cancellation Form has been signed by both partners and returned to the Venue. The cancellation date is the date the fully executed Cancellation Form is received by the Venue. Refunds, where applicable, will be processed within 14 days of receipt of the completed form.' },
        { t: 'p', text: 'The non-refundable initial deposit is retained in all cases, as it directly offsets the cost of reserving and removing the dates from the Venue’s availability calendar, as well as the administrative work involved in establishing and processing the booking. If a cancellation is submitted less than 120 days before check-in, any remaining scheduled payments not yet paid, including the final balance under Section 4’s payment schedule, become immediately due and payable in full, regardless of their originally scheduled due date.' },

        { t: 'h2', text: '4.4 Date Change Policy' },
        { t: 'p', text: 'The Client may request a one-time change of their booked event date, subject to the following conditions:' },
        { t: 'list', items: [
          'The request must be made in writing to rusticretreatalberta@gmail.com no less than 120 days prior to the original check-in date',
          'The requested new date must be available at the time the change is confirmed by the Venue',
          'A non-refundable date change administration fee of $250.00 is due upon confirmation of the new date availability to complete change',
          'All original deposits will be applied to the new date; no new deposit is required',
          'If current package pricing has increased, the new date will be invoiced at the updated rate. A revised contract will be issued to reflect the new event date regardless of any pricing change',
        ]},
        { t: 'p', text: 'Date change requests made less than 120 days before the original check-in date cannot be accommodated. As a small-capacity venue, Rustic Retreat is unlikely to be able to rebook the original dates within this window, and the standard cancellation policy (Section 4.3) will apply instead. A date change request does not constitute a cancellation and does not trigger the cancellation refund schedule, provided the 120-day threshold is met.' },

        { t: 'h2', text: '4.5 Missed Payments' },
        { t: 'p', text: 'If a scheduled payment under Section 4 is not received by its due date, the Venue will provide written notice to the Client. Payment must be received within 7 days of that notice. If payment is not received within this period, the booking will be treated as cancelled by the Client as of the date the grace period expires, and the cancellation refund schedule (Section 4.3) will apply based on the number of days remaining before check-in at that time.' },
        { t: 'initials', key: 'payments', label: 'Cancellation, date changes and missed payments (Sections 4.3–4.5)' },
      ],
    },

    // ─── 5. ADD-ONS & SERVICES ───────────────────────────────────────────────
    {
      id: '5',
      blocks: [
        { t: 'h1', text: '5. OPTIONAL ADD-ONS & SERVICES' },
        { t: 'p', text: 'Optional add-ons and services - including additional tents, RVs, propane, firewood, signage, generator rental, and pet fees - are managed via the Final Details Form, which will be provided in advance of your event and requires signatures from both parties.' },

        { t: 'h2', text: '5.1 Private Fireworks Display' },
        { t: 'note', title: 'FIREWORKS POLICY', text: 'Private fireworks displays are available as an optional add-on and are arranged exclusively through the Venue. If you are interested, a separate Fireworks Order Form will be provided. Final confirmation of any fireworks display will be made in the week prior to your celebration, subject to active Fire Bans, Advisories, or Restrictions in effect at that time. Guest-supplied fireworks, sky lanterns, or pyrotechnics of any kind are strictly prohibited. Unauthorized items will be confiscated. Unauthorized discharge of fireworks constitutes a material breach of this Agreement and may result in immediate event termination without refund, removal from property, and Guest liability for all damages, County fines, cleanup costs, and legal fees. No fireworks will be discharged during any active Fire Ban, Advisory, or Restriction: no exceptions. Check current status at www.albertafirebans.ca | lsac.ca/fire.' },
        { t: 'p', text: 'This is not a booking or financial commitment. Selecting “Yes” simply lets us know to reach out closer to your celebration to discuss options and finalize details.' },
        { t: 'choice', key: 'fireworks_interest', fill: CLIENT, required: true, label: 'FIREWORKS INTEREST',
          options: [
            { value: 'yes',       cells: ['Yes, we are interested'] },
            { value: 'no',        cells: ['No, thank you'] },
            { value: 'undecided', cells: ['Undecided — please follow up'] },
          ],
        },
        { t: 'fields', cols: 2, items: [
          { key: 'fireworks_budget', label: 'APPROXIMATE BUDGET (optional)', type: 'text', fill: CLIENT, required: false, placeholder: 'e.g. $500' },
        ]},

        { t: 'h2', text: '5.2 Vendor Management & Third-Party Services' },
        { t: 'p', text: 'The Client is responsible for all vendor sourcing, booking, coordination, and on-site management. Rustic Retreat does not provide or coordinate third-party vendor services. The Venue assumes no liability for the performance, conduct, or actions of any vendor operating on-site. All vendors must comply with Schedule A - Comprehensive Site Rules at all times. The Client is responsible for ensuring their vendors are informed of and adhere to all Venue rules prior to their arrival.' },
        { t: 'h3', text: 'Power Requirements & Electrical Disclosure' },
        { t: 'p', text: 'Prior Approval Required: All electrical power requirements, from vendors and Client/guest-supplied items alike, must be disclosed to the Venue no less than 7 days prior to check-in. This includes but is not limited to DJs, lighting companies, neon signs, string lights, slushie machines, coffee makers, projectors, and phone charging stations. No equipment may be connected to the Venue’s electrical system without prior written approval. A Power Requirements Form will be sent to the Client in advance and must be completed and returned by the 7-day deadline. If power requirements exceed the solar system’s capacity, Venue-owned generators are available for rent (fees and fuel costs apply, see Final Details Form); guest or vendor-supplied generators are subject to the 10:00 PM noise curfew. The Venue is not responsible for costs or disruptions arising from undisclosed power requirements. All vendors are subject to the same site rules as guests; the Client’s on-site contacts (Section 2.2) are responsible for vendor check-in and compliance.' },

        { t: 'h2', text: '5.3 Catering & Food Services' },
        { t: 'p', text: 'Clients are welcome to engage outside catering companies or arrange self-catered food service for their event. No Venue approval is required for the caterer; however, the Client must ensure their caterer is made aware of the following conditions prior to arrival:' },
        { t: 'h3', text: 'No On-Site Kitchen or Prep Facilities' },
        { t: 'p', text: 'Rustic Retreat does not have a commercial kitchen, prep kitchen, or bulk food preparation space. All food must be fully prepared, cooked, and ready to serve prior to arrival on-site. Basic food handling (plating, portioning, serving, warming) may occur on-site provided it does not require connection to the Venue’s power system beyond what has been pre-approved. Caterers with power requirements must follow the same power disclosure rules as all other vendors and Clients (see Section 5.2, Power Requirements & Electrical Disclosure). Power requirements must be submitted via the Power Requirements Form no less than 7 days prior to check-in.' },
        { t: 'h3', text: 'Cleanup & Waste' },
        { t: 'p', text: 'The Client and their caterer are jointly responsible for full cleanup of all food service areas, disposal of food waste, and removal of all catering equipment and supplies from the property by the designated check-out time. All waste must be bagged and placed in the designated waste area near the trampoline. No grease, food waste, or cooking byproducts may be poured or discarded on the ground or in any drainage area.' },

        { t: 'h2', text: '5.4 Planning Support' },
        { t: 'p', text: 'Rustic Retreat offers optional day-of coordination and full wedding planning support, available directly through us. Pricing for these services depends on the level of support requested and the complexity of the event, so it is not fixed in this Agreement. Indicating interest below is not a booking or financial commitment, it simply lets us know to reach out and discuss options tailored to your event.' },
        { t: 'choice', key: 'planning_support', fill: CLIENT, required: true, label: 'Planning support',
          options: [
            { value: 'day_of',    cells: ['Yes, we are interested in Day-of Coordination'] },
            { value: 'full',      cells: ['Yes, we are interested in Full Wedding Planning'] },
            { value: 'undecided', cells: ['Undecided, please follow up closer to our date'] },
            { value: 'none',      cells: ['Not interested at this time'] },
          ],
        },
      ],
    },

    // ─── 6. VENUE USE & RULES ────────────────────────────────────────────────
    {
      id: '6',
      blocks: [
        { t: 'h1', text: '6. VENUE USE & RULES' },
        { t: 'p', text: 'All property rules are set out in full in Schedule A, Comprehensive Site Rules, which must be signed by both parties and forms a mandatory part of this Agreement. Schedule A is the governing document for all matters of site conduct. The key deadlines and obligations highlighted below are drawn from Schedule A for visibility: they are not exhaustive.' },
        { t: 'list', items: [
          'Noise curfew: Music reduced by 11:00 PM Sun–Thu; minimally audible at property line by midnight Fri, Sat & Wedding Night. Guest generators off by 10:00 PM: no exceptions. Full rules: Schedule A, Section 2.',
          'Fire safety: No fires during any active Fire Ban or Advisory: no exceptions. Check status at www.albertafirebans.ca | lsac.ca/fire. Fires in designated pits only, attended at all times, fully extinguished before retiring. Full rules: Schedule A, Section 1.',
          'Power: Solar-powered property: all power requirements must be disclosed via the Power Requirements Form at least 7 days before check-in (see Section 5.2).',
          'Decorations & departure: Attachments by twine, zip ties, or light-duty tape only: no screws or fasteners. Property must be left as found: décor removed, trash and recycling bagged near the trampoline, dishes washed, all Venue items returned clean to original locations. Full rules: Schedule A.',
          'Trees & vegetation: No cutting, carving, or damaging any tree, living or dead, anywhere on the property, including for firewood; a $500 minimum per-tree charge applies. Full rules: Schedule A, Section 6; Rental Agreement Section 7.5.',
          'Emergencies: Call 911 first for any medical, fire, police, or other emergency. Notify the Venue immediately afterward, regardless of the time of day or night. Full rules: Schedule A, Section 12.',
        ]},
      ],
    },

    // ─── 7. DAMAGE, LIABILITY & WAIVER ───────────────────────────────────────
    {
      id: '7',
      blocks: [
        { t: 'h1', text: '7. DAMAGE, LIABILITY & WAIVER OF RESPONSIBILITY' },
        { t: 'h2', text: '7.1 Client Responsibility for Damage' },
        { t: 'p', text: 'The Client accepts full responsibility for any and all damage - intentional or accidental - to Rustic Retreat property, including the cabin, gazebo, grounds, outhouses, wash house, trails, furniture, firewood shed, trees and vegetation, all amenities, all structures, and any missing or damaged items. The Client is responsible for the full repair or replacement cost of any such damage. Unauthorized cutting, felling, or removal of any tree is addressed separately in Section 7.5, which sets a minimum per-tree charge, with liability for actual costs above that amount where applicable.' },
        { t: 'h2', text: '7.2 Client Responsibility for Guests' },
        { t: 'p', text: 'The Client is fully responsible for the behaviour, safety, and actions of all guests, vendors, contractors, and family members throughout the event, including covering all repair or replacement costs arising from guest behaviour.' },
        { t: 'h2', text: '7.3 Zero Liability Waiver' },
        { t: 'note', title: 'LIABILITY WAIVER: PLEASE READ CAREFULLY', text: 'By signing this agreement, the Client and their party waive, release, and discharge Rustic Retreat Weddings & Events Ltd., its directors, officers, shareholders, employees, agents, and any property owners whose land or facilities are used by the corporation in its operations, from any and all claims, demands, or liabilities for: personal injury (including death); illness; property damage or theft; wildlife encounters; and incidents involving fire, water, electricity, or physical activity on-site. This waiver applies regardless of cause, including negligence, natural elements, or unforeseen incidents.' },
        { t: 'initials', key: 'liability_waiver', label: 'Zero liability waiver (Section 7.3)' },

        { t: 'h2', text: '7.4 Event Liability Insurance' },
        { t: 'p', text: 'Rustic Retreat strongly recommends that all Clients obtain a Special Event Liability Insurance policy prior to their event. Event liability insurance can provide financial protection for the Client in the event of property damage, bodily injury, or other incidents arising during the event for which the Client is responsible under this Agreement. Special event insurance is widely available through Alberta insurance brokers and is typically affordable relative to the overall cost of a wedding. Obtaining event liability insurance is recommended but not mandatory. Regardless of whether the Client holds an insurance policy, the Client remains fully and solely responsible for all damage to Rustic Retreat property as set out in Sections 7.1 and 7.2. Insurance does not limit, reduce, or transfer the Client’s obligations under this Agreement. If the Client obtains a Special Event Liability Insurance policy, the Client agrees to provide a copy of the certificate of insurance to the Venue no less than 14 days prior to the event date.' },
        { t: 'initials', key: 'event_insurance', label: 'Event liability insurance (Section 7.4)' },

        { t: 'h2', text: '7.5 Tree & Vegetation Protection' },
        { t: 'p', text: 'No tree on the property, living or dead, standing or fallen, and no branch, limb, or other woody vegetation, may be cut, felled, girdled, carved, or otherwise removed or damaged for any reason, including for firewood. Rustic Retreat provides a fully stocked, self-serve firewood shed for all fire needs; the Client and their guests must not source firewood from any tree, branch, or deadfall on the property.' },
        { t: 'p', text: 'A minimum charge of $500.00 CAD per tree applies for any violation of this rule, whether by the Client or any guest, vendor, or contractor of the Client. Given the wide variation in tree size, age, and species across the property, the parties agree that this fixed minimum amount represents a genuine and reasonable pre-estimate of the Venue’s typical resulting damages, including cleanup, debris and stump removal, and loss of tree value, and is not a penalty. Where the Venue’s actual documented restoration, removal, or replacement costs for a given tree exceed $500.00 CAD, including for a large or mature tree, the Client remains fully liable for those actual costs under Section 7.1. This charge will first be deducted from the damage deposit held under Section 4.2. Any amount owing above the damage deposit will be invoiced to the Client and is due within 14 days of the invoice date.' },
        { t: 'initials', key: 'trees', label: 'Tree & vegetation protection (Section 7.5)' },
      ],
    },

    // ─── 8. GUEST-PLANNED ACTIVITIES ─────────────────────────────────────────
    {
      id: '8',
      blocks: [
        { t: 'h1', text: '8. GUEST-PLANNED ACTIVITIES' },
        { t: 'p', text: 'Rustic Retreat welcomes activities such as paintball, axe throwing, slip-and-slides, scavenger hunts, inflatables, water balloon fights, and other recreational events.' },
        { t: 'list', items: [
          'Venue Approval Required: All activities must be submitted in writing and approved in advance (description, participants, setup requirements).',
          'Designated Location Only: Activities may only occur in areas assigned by the Venue. Water-based activities require specific placement.',
          'Client Responsibility: The couple is solely responsible for planning, setup, supervision, cleanup, and ensuring third-party vendors comply with Venue rules.',
          'Liability: All guest-led activities are at the sole risk of the couple and their guests. The Venue assumes no liability.',
        ]},
        { t: 'h2', text: '8.1 Drone & Aerial Photography Policy' },
        { t: 'p', text: 'Drone and aerial photography is permitted on the property subject to prior approval. The Client or their vendors must request drone use in writing no less than 14 days prior to check-in and receive written confirmation from the Venue before any drone is operated on-site.' },
        { t: 'p', text: 'Conditions of approval:' },
        { t: 'list', items: [
          'The drone operator must comply with all applicable Transport Canada regulations, including holding a valid RPAS (Remotely Piloted Aircraft Systems) pilot certificate appropriate for the operation',
          'Flight paths must remain within the Venue property boundaries and must not fly over or toward neighbouring properties without prior written consent from those property owners',
          'The couple’s permission is required before any drone footage or photography is captured of guests, the wedding party, or the ceremony',
          'Drones may not be operated during active fireworks displays, during any fire ban or advisory, or in conditions of limited visibility',
          'The Client and their drone operator assume full liability for any damage, injury, or privacy violation arising from drone use on the property',
        ]},
        { t: 'p', text: 'The Venue reserves the right to revoke drone approval at any time if safety, weather, or neighbour considerations require it.' },
        { t: 'initials', key: 'drone', label: 'Drone & aerial photography (Section 8.1)' },
      ],
    },

    // ─── 9. ALCOHOL & SUBSTANCE USE ──────────────────────────────────────────
    {
      id: '9',
      blocks: [
        { t: 'h1', text: '9. ALCOHOL & SUBSTANCE USE' },
        { t: 'list', items: [
          'An AGLC Special Event Licence is required when alcohol is being served - the event host is responsible for obtaining this. The AGLC typically requires a minimum of 30 days notice; Clients are encouraged to apply well in advance of their event date. The Client must provide the Venue with a copy of the valid licence no less than 7 days prior to check-in. Events involving alcohol service without a valid licence will not be permitted to proceed.',
          'Illegal drug use is strictly prohibited and will result in immediate removal and police contact.',
          'The Client assumes full responsibility for guests under the influence. Arrange designated drivers or overnight stays for guests who consume alcohol.',
          'The Venue is not liable for any injury, damage, or legal consequence resulting from substance use or impaired driving.',
        ]},
        { t: 'initials', key: 'alcohol', label: 'Alcohol & substance use (Section 9)' },
      ],
    },

    // ─── 10. FORCE MAJEURE ───────────────────────────────────────────────────
    {
      id: '10',
      blocks: [
        { t: 'h1', text: '10. FORCE MAJEURE & CANCELLATION BY VENUE' },
        { t: 'p', text: 'Rustic Retreat is not liable for cancellations or modifications required due to weather, natural disasters, government orders, fire bans, or events beyond the Venue’s reasonable control. The Venue will work in good faith to reschedule where possible.' },
        { t: 'list', items: [
          'The Venue reserves the right to cancel or terminate any event for safety reasons or guest behaviour violations, without refund.',
        ]},
        { t: 'h2', text: '10.1 Venue-Side Force Majeure: Payments' },
        { t: 'p', text: 'If the Venue must cancel the event due to force majeure (as described above) and no mutually agreeable reschedule date is available, the Client may choose either: (a) a refund of 50% of all payments made, with the remaining 50% retained by the Venue to offset the loss of the reserved date; or (b) a full credit, at 100% of payments made, toward a future available date within 18 months of the original event date. This credit is non-transferable, consistent with the non-transferable nature of all bookings under this Agreement. The non-refundable initial deposit is included within the payments subject to this clause. The Client must notify the Venue of their choice in writing within 14 days of the Venue’s force majeure notice.' },
        { t: 'initials', key: 'force_majeure', label: 'Venue-side force majeure (Section 10.1)' },
      ],
    },

    // ─── 11. PROMOTIONAL USE ─────────────────────────────────────────────────
    {
      id: '11',
      blocks: [
        { t: 'h1', text: '11. PROMOTIONAL USE AGREEMENT (OPTIONAL)' },
        { t: 'p', text: 'By selecting YES below, you voluntarily grant Rustic Retreat permission to use photos you provide after your wedding, or photos captured by Rustic Retreat staff during your event, for our website, social media, or other marketing. No financial compensation will be provided.' },
        { t: 'choice', key: 'promotional_use', fill: CLIENT, required: true, label: 'Promotional photo permission',
          options: [
            { value: 'yes', cells: ['YES: We grant Rustic Retreat permission to use our wedding photos for promotional purposes.'] },
            { value: 'no',  cells: ['NO: We do not grant promotional photo permission.'] },
          ],
        },
        { t: 'p', text: 'The Client agrees to inform guests that photography may occur for promotional use and assumes responsibility for obtaining any necessary guest photo releases.' },
        { t: 'initials', key: 'promotional_use_ack', label: 'Promotional use agreement (Section 11)' },
      ],
    },

    // ─── 12. GENERAL PROVISIONS ──────────────────────────────────────────────
    {
      id: '12',
      blocks: [
        { t: 'h1', text: '12. GENERAL PROVISIONS' },
        { t: 'h2', text: '12.1 Schedule A: Comprehensive Site Rules' },
        { t: 'p', text: 'Schedule A, Comprehensive Site Rules & Guest Management, forms a mandatory part of this Agreement. This contract is not considered complete or binding until both parties have also signed Schedule A. The Client is responsible for ensuring all guests, vendors, contractors, and staff comply with Schedule A at all times.' },

        { t: 'h2', text: '12.2 Preferred Contact Method' },
        { t: 'choice', key: 'preferred_contact_method', fill: CLIENT, required: true, label: 'Preferred contact method',
          options: [
            { value: 'text',  cells: ['Text'] },
            { value: 'email', cells: ['Email'] },
          ],
        },
        { t: 'fields', cols: 1, items: [
          { key: 'preferred_contact_details', label: 'PREFERRED CONTACT DETAILS (phone number or email address)', type: 'text', fill: CLIENT, required: true },
        ]},

        { t: 'h2', text: '12.3 Security & Site Access' },
        { t: 'p', text: 'Rustic Retreat staff reserve the right to enter event spaces at any time for safety, maintenance, or enforcement of this Agreement. Non-invasive monitoring (motion sensors, security cameras in non-private areas) may be in use for property protection.' },

        { t: 'h2', text: '12.4 Entire Agreement' },
        { t: 'p', text: 'This Agreement, including all Schedules and Attachments, constitutes the entire agreement between the parties. No verbal promises are binding. All modifications must be in writing and signed by both parties.' },

        { t: 'h2', text: '12.5 Dispute Resolution' },
        { t: 'p', text: 'In the event of any dispute, claim, or disagreement arising out of or relating to this Agreement, the parties agree to first attempt resolution in good faith through direct communication. Either party may initiate this process by providing written notice describing the nature of the dispute and the resolution sought. If the dispute is not resolved within 14 days of written notice, both parties agree to submit the dispute to mediation before initiating any legal proceedings. Mediation shall be conducted in Lac Ste. Anne County, Alberta, using a mutually agreed-upon mediator. The cost of mediation shall be shared equally between the parties unless otherwise agreed. Neither party may commence legal proceedings until mediation has been completed or a mediator confirms in writing that it has been attempted and failed. This Agreement is governed by the laws of the Province of Alberta. Any legal proceedings shall be brought exclusively in the courts of Alberta, with jurisdiction in Lac Ste. Anne County. Nothing in this section prevents either party from seeking injunctive or emergency relief from a court of competent jurisdiction where immediate harm is threatened.' },

        { t: 'h2', text: '12.6 Property Accessibility Disclosure' },
        { t: 'p', text: 'Rustic Retreat is a working rural property on natural land. The Client is responsible for reviewing the following property conditions with their guests and advising them in advance:' },
        { t: 'list', items: [
          'Uneven and natural terrain throughout - grass, gravel, packed earth, and uneven ground. Footing may be uneven, particularly in field areas, along trails, and around camping areas.',
          'No paved paths or ramps - there are no paved walkways, ramps, or hard-surface accessible routes between structures or event areas.',
          'Outhouse facilities only - there are no indoor flush toilets. Clients accommodating guests with specific washroom accessibility needs are encouraged to arrange portable accessible washroom rentals in advance.',
          'Solar power system: the property operates on solar power; power availability may be limited and subject to weather and system capacity. All power-drawing equipment requires prior disclosure and approval. See Section 5.2 for full power requirements and the Power Requirements Form process.',
        ]},
        { t: 'p', text: 'Clients with specific accessibility questions or requirements are encouraged to contact the Venue prior to signing this Agreement.' },
        { t: 'initials', key: 'accessibility', label: 'Property accessibility disclosure (Section 12.6)' },
      ],
    },

    // ─── 13. ADDITIONAL NOTES ────────────────────────────────────────────────
    {
      id: '13',
      blocks: [
        { t: 'h1', text: '13. ADDITIONAL NOTES' },
        { t: 'p', text: 'Any additional terms, special arrangements, or notes agreed upon by both parties:' },
        { t: 'fields', cols: 1, items: [
          { key: 'additional_notes', label: '', type: 'textarea', fill: VENUE, required: false,
            placeholder: 'Enter any additional terms, special arrangements, or notes agreed upon by both parties…' },
        ]},
      ],
    },
  ],

  // Reproduced after the signatures, exactly as in the paper contract.
  appendix: {
    title: 'EMERGENCY QUICK REFERENCE',
    rows: [
      ['ALL EMERGENCIES', '9-1-1'],
      ['Non-Emergency RCMP', '(780) 967-2020'],
      ['Poison Control', '1-800-332-1414'],
      ['Fire Ban Status', 'www.albertafirebans.ca  |  www.lsac.ca/fire'],
      ['Venue Emergency Contact', 'Shannon Ouimet, (780) 210-6252'],
      ['Assembly Point (Fire Emergency)', 'Venue Administration Building (Residence 2)'],
      ['First Aid Kits', 'Bridal Suite and Couple’s Cabin'],
      ['Fire Extinguishers', 'Gazebo, Bridal Suite, Generator Area'],
    ],
  },

  // Section 4's schedule. Percentages are of `total_package_fee`; the damage
  // deposit is a flat amount taken at check-in and is not part of the package
  // fee, which is why it carries `flat` instead of `pct`.
  paymentSchedule: [
    { label: 'Initial Deposit (non-refundable / non-transferable)', pct: 25, due: 'Due upon signing to secure dates' },
    { label: '2nd Payment: 25%',                                    pct: 25, due: '180 days before check-in' },
    { label: 'Balance: 50%',                                        pct: 50, due: '90 days before check-in' },
    { label: 'Guest / RV / Tent Overage Adjustments',               tbd: true, due: '7 days before check-in' },
    { label: 'Damage Deposit (refundable)',                         flat: 'damage_deposit', due: 'Due at Check-In' },
  ],

  signatures: {
    intro:
      'By signing below, all parties confirm they have read, understood, and agree ' +
      'to all terms, conditions, and Schedules of this Wedding Venue Rental ' +
      'Agreement, including Schedule A, Comprehensive Site Rules.',
  },
};
