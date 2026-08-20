// Schedule A — Comprehensive Site Rules & Guest Management.
//
// Transcribed from the venue's own 6-page PDF (2027_Contract_Schedule_A_TEMPLATE).
// Wording is the owner's, verbatim.
//
// Unlike the rental agreement this document asks for nothing from the reader:
// no fill-in fields, no initials, just the rules and an acknowledgment signature
// at the end. It is never sent on its own — Section 12.1 of the rental agreement
// makes the booking incomplete until both are signed, so the two travel together
// as one packet and are signed in a single ceremony.

module.exports = {
  key: 'schedule-a-2027',
  version: 1,
  title: 'Schedule A — Comprehensive Site Rules & Guest Management',
  subtitle: 'Attachment to the Wedding Venue Rental Agreement',

  preamble:
    'These site rules apply to all guests, vendors, contractors, and staff present ' +
    'on the property during events. The event host (Client) is responsible for ' +
    'ensuring all guests are aware of and comply with these rules. This Schedule ' +
    'forms a mandatory part of the Wedding Venue Rental Agreement and must be ' +
    'signed by both parties. The contract is not considered complete until this ' +
    'Schedule has been signed. Violations may result in removal from the property ' +
    'and forfeiture of the damage deposit.',

  venueBlock: {
    name: 'Rustic Retreat Weddings & Events Ltd.',
    signatory: 'Shannon Ouimet, Venue Coordinator',
    email: 'rusticretreatalberta@gmail.com',
    phone: '(780) 210-6252',
    physicalAddress: '3121 Township Road 572A, Lac Ste. Anne County, Alberta',
  },

  sections: [
    {
      id: 'A1',
      blocks: [
        { t: 'h1', text: '1. FIRE SAFETY & SMOKING' },
        { t: 'h2', text: '1.1 Fire Pits & Open Fires' },
        { t: 'note', title: 'FIRE SAFETY: RURAL PROPERTY RULES STRICTLY ENFORCED',
          text: 'Check fire ban status before every event: www.albertafirebans.ca | lsac.ca/fire. No fires of any kind are permitted during a Fire Ban or Fire Advisory. Violations may result in fines under the Alberta Forest and Prairie Protection Act.' },
        { t: 'list', items: [
          'Designated fire pits only: no fires outside marked fire pit locations.',
          'Fire pits must be attended at all times: never leave a fire unattended.',
          'Fires must be fully extinguished before guests retire and before departure.',
          'Dead-out check required: ashes must be cold to the touch; use water or sand.',
          'Maximum fire size: 1 metre diameter, 60 cm height.',
          'Fire extinguishers are for emergency use only: a non-emergency discharge fee will be deducted from the damage deposit.',
        ]},
        { t: 'h2', text: '1.2 Smoking' },
        { t: 'list', items: [
          'Use cigarette disposal containers or fire pit: never discard on the ground or in vegetation.',
          'No smoking inside any buildings: all structures are non-smoking.',
          'Enhanced caution during dry conditions: no smoking while walking through forested or grassy areas during Fire Advisory periods.',
        ]},
        { t: 'h2', text: '1.3 Fireworks Policy' },
        { t: 'p', text: 'All fireworks at this venue are managed exclusively by Venue staff. Guest-supplied fireworks are strictly prohibited.' },
        { t: 'list', items: [
          'Venue-coordinated only: all fireworks must be arranged, organized, and purchased exclusively through the Venue.',
          'Venue handles all permits and County Fire Services approvals required for display fireworks.',
          'Professional setup, discharge, and cleanup: Venue staff will handle all aspects.',
          'Advance booking required: must be requested via the Fireworks Order Form provided separately.',
          'No fireworks during Fire Ban, Fire Advisory, or Restriction: no exceptions.',
          'Fire safety measures maintained: fire extinguishers, water supply, and safety personnel present during all displays.',
          'Post-discharge inspection: Venue staff will inspect discharge area for smoldering materials.',
          'Unauthorized discharge of fireworks constitutes a material breach of the Agreement and may result in immediate event termination without refund, removal from property, and Guest liability for all damages, County fines, cleanup costs, and legal fees.',
        ]},
        { t: 'h2', text: '1.4 Candles & Decorative Flames' },
        { t: 'list', items: [
          'LED flameless candles strongly encouraged: preferred over real candles for all décor.',
          'Real candles must be in stable holders, attended at all times, and extinguished before leaving area unattended.',
          'No candles in tents or fabric structures: serious fire hazard.',
          'Tiki torches: must be secured, positioned away from structures, and extinguished before leaving unattended.',
        ]},
      ],
    },

    {
      id: 'A2',
      blocks: [
        { t: 'h1', text: '2. NOISE & QUIET HOURS' },
        { t: 'table',
          head: ['Night(s)', 'Noise Reduction Time', 'Requirement'],
          rows: [
            ['Sunday – Thursday', '11:00 PM', 'Music reduced to reasonable conversational level'],
            ['Friday – Saturday & Wedding Night', '12:00 Midnight', 'Minimally audible at property line'],
          ],
        },
        { t: 'list', items: [
          'Speakers must be aimed inward under the gazebo, away from property lines.',
          'DJ/sound equipment: professional setup only; volume monitored by staff.',
          'Guest and vendor-supplied generators off by 10:00 PM: mandatory, no exceptions. Venue-supplied generators (noise-dampened, arranged through the Venue) are not subject to this curfew and are managed by Venue staff.',
          'Vehicle noise: no revving engines, loud exhaust, or car stereos after 10:00 PM.',
          'Non-compliance may result in a staff-mandated shutdown of sound equipment.',
        ]},
      ],
    },

    {
      id: 'A3',
      blocks: [
        { t: 'h1', text: '3. CAMPING & RV RULES' },
        { t: 'note', title: 'WASTEWATER DISCHARGE IS STRICTLY PROHIBITED',
          text: 'No greywater or blackwater may be discharged anywhere on this property. Violations are subject to environmental cleanup fees per contract.' },
        { t: 'list', items: [
          'Self-contained RVs only: all RVs must have functional fresh water and holding tanks.',
          'No hookups provided: no electrical, water, or sewer connections. Off-grid / boondocking only.',
          'No RV dump station on-site: guests must be self-sufficient or use off-site facilities.',
          'RVs over 30 feet: use alternate exit route, 572A → RR31 → 570 → Hwy 33.',
          'Slide-outs and awnings: ensure adequate clearance from neighbouring units and trees.',
          'Tent campers: respect spacing, use provided waste bins, and maintain a clean camping area.',
          'Pack in, pack out: leave your camping area cleaner than you found it.',
        ]},
      ],
    },

    {
      id: 'A4',
      blocks: [
        { t: 'h1', text: '4. VEHICLE & TRAFFIC RULES' },
        { t: 'list', items: [
          'On-site parking only: no parking on TWP RD 572A or any County roads.',
          'Emergency access lane (gravel driveway) must remain clear at all times: no parking.',
          'Speed limit: 15 km/h on all internal roads and driveways.',
          'Watch for pedestrians, children, animals, and wildlife at all times.',
          'RVs over 30 ft must use alternate exit: 572A → RR31 → 570 → Hwy 33.',
        ]},
        { t: 'note', title: 'ZERO TOLERANCE: IMPAIRED DRIVING',
          text: 'No impaired driving under any circumstances. Arrange a sober driver before the event, use a shuttle/taxi, or stay overnight on-site. Venue staff and event hosts are empowered to hold keys if impaired driving is suspected.' },
      ],
    },

    {
      id: 'A5',
      blocks: [
        { t: 'h1', text: '5. ALCOHOL & RESPONSIBLE SERVICE' },
        { t: 'list', items: [
          'AGLC Special Event Licence required: event host is responsible for obtaining it when alcohol is served. A copy of the valid licence must be provided to the Venue no less than 7 days prior to check-in. Events involving alcohol service without a valid licence will not be permitted to proceed.',
          'No alcohol service to minors: ID checks required for anyone appearing under 25.',
          'No alcohol may be sold on-site under any circumstances.',
          'Overnight camping is strongly encouraged for guests consuming alcohol.',
          'Hosts and Venue staff may intervene to prevent impaired driving, including holding vehicle keys.',
        ]},
      ],
    },

    {
      id: 'A6',
      blocks: [
        { t: 'h1', text: '6. WASTE, RECYCLING & ENVIRONMENTAL PROTECTION' },
        { t: 'table',
          head: ['Bin Type', 'Colour / Label', 'Accepted Materials'],
          rows: [
            ['General Waste', 'Black / General Waste Bins', 'Non-recyclable waste and garbage'],
            ['Recycling', 'Blue Bins', 'Cans and bottles'],
            ['Organics / Compost', 'White Bins (where provided)', 'Food scraps and organic waste'],
          ],
        },
        { t: 'list', items: [
          'No littering. Use provided facilities at all times.',
          'No outdoor urination or defecation: use provided outhouses and/or portable toilets.',
          'No dumping of any kind: fuel, chemicals, wastewater, and garbage must be disposed of properly.',
          'No tree cutting, carving, or damage of any kind, living or dead. See the Tree & Vegetation Protection notice below.',
        ]},
        { t: 'note', title: 'NO TREE CUTTING — $500 MINIMUM CHARGE PER TREE',
          text: 'No tree — living or dead, standing or fallen — may be cut, felled, carved, or removed anywhere on the property, for any reason, including firewood. A fully stocked, self-serve firewood shed is provided for all fire needs. Do not source firewood from any tree or deadfall on the property. Violations result in a minimum $500 charge per tree, deducted from the damage deposit with any balance invoiced to the Client. Larger or mature trees may incur additional actual costs above $500. See Rental Agreement, Section 7.5.' },
        { t: 'list', items: [
          'Stay on paths and roads: avoid trampling vegetation or creating new trails.',
          'Report any fuel, chemical, or sewage spills to staff immediately.',
        ]},
      ],
    },

    {
      id: 'A7',
      blocks: [
        { t: 'h1', text: '7. PETS' },
        { t: 'list', items: [
          'Pets allowed with advance approval: event host must notify Venue in advance (pet fee may apply).',
          'Leashed (max 6-foot leash) at all times in main areas.',
          'Off-leash permitted in the back field and on walking trails: pet must remain under owner’s verbal control.',
          'Owner responsible at all times: livestock (chickens, goats, turkeys, ducks, cats, and dogs) are present on the property.',
          'Clean up after pets: waste bags provided; dispose in designated bins.',
          'No aggressive animals: pets showing aggression must be removed from the property immediately.',
          'No pets in the Bridal Suite or Décor Shed (see Section 9).',
          'Excessive barking or noise is not permitted and may result in removal.',
        ]},
      ],
    },

    {
      id: 'A8',
      blocks: [
        { t: 'h1', text: '8. POWER REQUIREMENTS' },
        { t: 'p', text: 'All electrical power requirements must be disclosed to the Venue no less than 7 days prior to check-in. This applies to all vendors and to any items the Client or their guests are bringing that require power, including but not limited to string lights, neon signs, slushy machines, coffee makers, projectors, and phone charging stations. No power-drawing item may be connected to the Venue’s electrical system without prior written approval. See Section 5.2 of the Rental Agreement and complete the Power Requirements Form sent by the Venue in advance of your event.' },
        { t: 'list', items: [
          'Guest and vendor-supplied generators are subject to the 10:00 PM noise curfew without exception.',
          'Venue-supplied generators (noise-dampened, arranged through the Venue) are managed by Venue staff and are not subject to the 10:00 PM curfew.',
          'Failure to disclose power requirements may result in equipment being unable to operate on-site. The Venue is not responsible for costs or disruptions from undisclosed power needs.',
        ]},
      ],
    },

    {
      id: 'A9',
      blocks: [
        { t: 'h1', text: '9. DÉCOR SHED' },
        { t: 'p', text: 'The Décor Shed is a self-serve space available to all Clients as part of their package. It contains a variety of decorative items that may be used throughout the event at no charge. The following rules apply:' },
        { t: 'list', items: [
          'All items must be cleaned and returned to their original bins and locations by check-out.',
          'Any damaged or missing items must be reported to Shannon at check-out. Costs for unreported or damaged items may be deducted from the damage deposit.',
          'No pets permitted in the Décor Shed.',
          'Clients wishing to contribute items to the Décor Shed are welcome to discuss this with Shannon. Items cannot be added without prior approval: all new items require inventory registration, labelling, and bin assignment. Do not place contributed items in the shed without Shannon’s direction.',
          'Items with associated fees (consumables and select rental items) are managed separately by the Venue and are not stored in the self-serve shed.',
        ]},
      ],
    },

    {
      id: 'A10',
      blocks: [
        { t: 'h1', text: '10. PROHIBITED ACTIVITIES: ZERO TOLERANCE' },
        { t: 'note', title: 'STRICTLY PROHIBITED', items: [
          'ATVs, UTVs, dirt bikes, or off-road recreational vehicles (mobility devices excepted)',
          'Hunting or firearms: no firearms permitted on property during events',
          'Knives (except small pocket knives), bows, and other weapons. Note: tools used within specifically approved guest activities (e.g. axes for approved axe throwing, see Section 8 of the Rental Agreement) are permitted solely within the context and location of that approved activity',
          'Illegal drugs or substances: immediate removal and authorities contacted',
          'Unauthorized fires outside designated fire pits',
          'Firewood collection: do not cut or collect any wood from the property',
          'Tree cutting, carving, or damage (living or dead): $500 minimum per-tree charge applies — see Section 6',
          'Unauthorized use of buildings or equipment',
          'Fishing or swimming in the pond',
        ]},
      ],
    },

    {
      id: 'A11',
      blocks: [
        { t: 'h1', text: '11. CHILDREN & SAFETY' },
        { t: 'list', items: [
          'Children must be supervised at all times: parents and guardians are fully responsible.',
          'No unattended children near fire pits: adult supervision is mandatory at all fires.',
          'Children must be supervised near parking areas and internal roads.',
          'Pond safety: children not permitted near the pond without direct adult supervision. Fishing and swimming in the pond are prohibited.',
          'This is a natural, wooded rural property. Wildlife including deer, coyotes, porcupines, skunks, and various bird species can be present at any time: most active at dawn and dusk.',
          'Do not approach or feed wildlife: observe from a safe distance.',
          'Secure food and garbage: prevent attracting wildlife to camping areas.',
        ]},
      ],
    },

    {
      id: 'A12',
      blocks: [
        { t: 'h1', text: '12. WEATHER & EMERGENCY PROCEDURES' },
        { t: 'note', title: 'ALL EMERGENCIES: CALL 911 FIRST, THEN NOTIFY THE VENUE',
          text: 'For any emergency — medical, fire, police involvement, or otherwise — call 911 (or the appropriate emergency service) first. Do not wait or hesitate. As soon as it is safe to do so, notify the Venue using the Event Emergency Hotline: (780) 210-6252 (Shannon Ouimet) — regardless of the time of day or night. This includes any situation where police (RCMP) are called to the property for any reason, including disputes, impaired driving, trespassing, or noise complaints. The Venue must be notified as soon as possible, even outside normal hours.' },
        { t: 'h2', text: '12.1 Severe Weather' },
        { t: 'list', items: [
          'Monitor weather conditions: staff will provide updates if severe weather is approaching.',
          'Stay indoors during lightning: avoid open areas, tents, and elevated ground.',
          'Follow staff directions: in extreme weather, evacuate to the designated shelter immediately.',
        ]},
        { t: 'h2', text: '12.2 Fire Emergency' },
        { t: 'note', title: 'FIRE EMERGENCY RESPONSE: ALL GUESTS MUST KNOW THIS', items: [
          'Assembly Point: Venue Administration Building/Shannon’s House; evacuate here immediately',
          'Call 911 immediately: Do NOT assume someone else has called',
          'Notify staff immediately, Event Emergency Hotline: (780) 210-6252 (Shannon Ouimet)',
          'Do NOT re-enter any building: Wait outside for Fire Department all-clear',
          'Wildfire: Evacuate the entire property immediately; do not shelter in buildings',
        ]},
        { t: 'h2', text: '12.3 Medical Emergency' },
        { t: 'list', items: [
          'First Aid Kits: Bridal Suite and Couple’s Cabin',
          'Serious Injuries: Call 911 immediately; do not delay treatment',
          'Event Emergency Hotline: (780) 210-6252 (Shannon Ouimet, Venue Coordinator); available throughout your event for emergencies and urgent venue matters',
        ]},
      ],
    },

    {
      id: 'A13',
      blocks: [
        { t: 'h1', text: '13. RESPECT & CONDUCT' },
        { t: 'list', items: [
          'Respect other guests, property, and neighbours: be courteous and considerate at all times.',
          'No harassment or discrimination: all guests deserve a safe and welcoming environment.',
          'Follow staff directions: on-site operators are present for your safety and comfort.',
          'No vandalism or damage: any damage will be charged to the event host.',
          'Return all Venue-supplied items (furniture, equipment, tools, etc.) to their original locations, clean and properly stored. For Décor Shed items, see Section 9.',
          'Photography etiquette: respect the couple’s wishes regarding photos and social media.',
        ]},
      ],
    },

    {
      id: 'A14',
      blocks: [
        { t: 'h1', text: '14. VIOLATION CONSEQUENCES' },
        { t: 'table',
          head: ['Violation Level', 'Consequence'],
          rows: [
            ['First violation', 'Verbal warning, documented by staff'],
            ['Repeat violation', 'Removal from property without refund of event fees (damage deposit refund subject to Section 4.2 of the Rental Agreement)'],
            ['Serious violation (safety / fire / environmental)', 'Immediate removal from property and authorities contacted'],
          ],
        },
        { t: 'p', small: true, text: 'Note: Fixed monetary charges specified elsewhere in this Agreement — including the $500 minimum per-tree charge (Section 6; Rental Agreement Section 7.5) and the non-emergency fire extinguisher discharge fee — apply in addition to, and independently of, the violation consequences above.' },
      ],
    },
  ],

  appendix: {
    title: 'EMERGENCY QUICK REFERENCE',
    rows: [
      ['ALL EMERGENCIES', '9-1-1'],
      ['Non-Emergency RCMP', '(780) 967-2020'],
      ['Poison Control', '1-800-332-1414'],
      ['Fire Ban Status', 'www.albertafirebans.ca | lsac.ca/fire'],
      ['Property Owner', 'Shannon Ouimet, (780) 210-6252'],
      ['Property Address', '3121 TWP RD 572A'],
      ['Assembly Point (Fire)', 'Venue Administration Building (Residence 2)'],
      ['First Aid Kits', 'Bridal Suite and Couple’s Cabin'],
      ['Fire Extinguishers', 'Gazebo, Bridal Suite, Generator Area'],
    ],
  },

  signatures: {
    heading: 'ACKNOWLEDGMENT & SIGNATURES',
    intro:
      'By signing below, the Client(s) confirm they have read and understood the ' +
      'Comprehensive Site Rules set out in Schedule A and agree to ensure all guests, ' +
      'vendors, and contractors present at their event are made aware of and comply ' +
      'with these rules. The Client acknowledges that violations may result in removal ' +
      'from the property and forfeiture of the damage deposit. This signed Schedule A ' +
      'must be returned together with the signed Wedding Venue Rental Agreement before ' +
      'the booking is considered complete.',
  },
};
