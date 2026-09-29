# Builds Cunga-Stock-User-Manual.pdf:  python scripts/make_manual.py Cunga-Stock-User-Manual.pdf public/cunga-logo-nobg.png
# Needs: pip install reportlab   (uses the Windows Arial font)
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
                                Image, ListFlowable, ListItem, KeepTogether)
import datetime, sys
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping
pdfmetrics.registerFont(TTFont('Arial', 'C:/Windows/Fonts/arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold', 'C:/Windows/Fonts/arialbd.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Italic', 'C:/Windows/Fonts/ariali.ttf'))
addMapping('Arial', 0, 0, 'Arial'); addMapping('Arial', 1, 0, 'Arial-Bold'); addMapping('Arial', 0, 1, 'Arial-Italic'); addMapping('Arial', 1, 1, 'Arial-Bold')

OUT = sys.argv[1]
LOGO = sys.argv[2]
NAVY = colors.HexColor('#1E3A8A')
BLUE = colors.HexColor('#0EA5E9')
LIGHT = colors.HexColor('#F1F5FF')
GREY = colors.HexColor('#64748B')

ss = getSampleStyleSheet()
for st in ss.byName.values():
    st.fontName = 'Arial-Bold' if 'Heading' in st.name or st.name == 'Title' else 'Arial'
H1 = ParagraphStyle('H1', parent=ss['Heading1'], textColor=NAVY, fontSize=18, spaceBefore=4, spaceAfter=8)
H2 = ParagraphStyle('H2', parent=ss['Heading2'], textColor=NAVY, fontSize=13, spaceBefore=10, spaceAfter=4)
P = ParagraphStyle('P', parent=ss['BodyText'], fontSize=10, leading=14.5, spaceAfter=5)
SMALL = ParagraphStyle('S', parent=P, fontSize=8.5, textColor=GREY, leading=12)
TIP = ParagraphStyle('TIP', parent=P, backColor=colors.HexColor('#ECFDF5'), borderColor=colors.HexColor('#16A34A'),
                     borderWidth=0.6, borderPadding=6, spaceBefore=6, spaceAfter=10, leftIndent=4, rightIndent=4)
WARN = ParagraphStyle('WARN', parent=TIP, backColor=colors.HexColor('#FFFBEB'), borderColor=colors.HexColor('#F59E0B'))

story = []
def h1(t): story.append(Paragraph(t, H1))
def h2(t): story.append(Paragraph(t, H2))
def p(t): story.append(Paragraph(t, P))
def tip(t): story.append(Paragraph('<b>Tip:</b> ' + t, TIP))
def warn(t): story.append(Paragraph('<b>Good to know:</b> ' + t, WARN))
def steps(items, numbered=True):
    story.append(ListFlowable([ListItem(Paragraph(i, P), leftIndent=12) for i in items],
                              bulletType='1' if numbered else 'bullet', start='1' if numbered else None,
                              leftIndent=14, bulletFontSize=9.5))
def table(rows, widths, head=True):
    HEAD = ParagraphStyle('HEAD', parent=P, textColor=colors.white, fontName='Arial-Bold')
    t = Table([[Paragraph(str(c), HEAD if (head and ri == 0) else P) for c in r] for ri, r in enumerate(rows)],
              colWidths=widths, repeatRows=1 if head else 0)
    style = [('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#CBD5E1')),
             ('VALIGN', (0, 0), (-1, -1), 'TOP'),
             ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT])]
    if head:
        style += [('BACKGROUND', (0, 0), (-1, 0), NAVY), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white)]
    t.setStyle(TableStyle(style))
    story.append(t)
    story.append(Spacer(1, 8))

# ─── Cover ───
story.append(Spacer(1, 50 * mm))
img = Image(LOGO, width=70 * mm, height=70 * mm * 202 / 296)
story.append(img)
story.append(Spacer(1, 12 * mm))
story.append(Paragraph('Cunga Stock — Clothing Store', ParagraphStyle('T', parent=H1, fontSize=26, alignment=1)))
story.append(Paragraph('User Manual', ParagraphStyle('ST', parent=H2, fontSize=16, alignment=1, textColor=BLUE)))
story.append(Spacer(1, 8 * mm))
story.append(Paragraph('How to sell, manage stock, customers, debts, orders and reports — on a phone or a computer.',
                       ParagraphStyle('C', parent=P, alignment=1, fontSize=11)))
story.append(Spacer(1, 40 * mm))
story.append(Paragraph(f'Version of {datetime.date.today():%d %B %Y}', ParagraphStyle('D', parent=SMALL, alignment=1)))
story.append(PageBreak())

# ─── Contents ───
h1('Contents')
for i, t in enumerate(['What Cunga Stock does', 'Who can do what (roles)', 'Logging in and installing on a phone',
                       'Dashboard', 'Sales — selling at the till', 'Stock — items, colours, sizes, photos, outfit sets',
                       'Categories', 'Temporary Stock — clothes out on approval', 'Customers', 'Debts (Amadeni)',
                       'Orders & Deliveries', 'Reports', 'History', 'Notifications and phone alerts', 'Settings',
                       'Problems and answers'], 1):
    story.append(Paragraph(f'{i}. {t}', P))
story.append(PageBreak())

# ─── 1 ───
h1('1. What Cunga Stock does')
p('Cunga Stock keeps everything a clothing shop needs in one place, on any phone or computer:')
steps(['<b>Sell</b> single garments or full outfits, take cash / Mobile Money / bank / credit, and print or share a receipt.',
       '<b>Know your stock</b> for every design, colour and size — what is left, what sold, what is running low.',
       '<b>Follow customers</b> — what they bought, and who owes the shop money (Amadeni).',
       '<b>Track clothes taken on approval</b> — who has them and when they must come back.',
       '<b>Order from suppliers</b> and confirm exactly what arrived.',
       '<b>See how the shop is doing</b> — sales, profit, cash vs credit, best sellers, late debts.',
       '<b>Get alerts on the owner\'s phone</b> — every sale, low stock, payments due, deliveries.'], numbered=False)
p('Everything is <b>live</b>: when a storekeeper makes a sale on one phone, every other phone and computer updates '
  'within a second or two — nobody has to refresh. All money is in <b>RWF</b>.')

# ─── 2 ───
h1('2. Who can do what (roles)')
table([['Role', 'Can do', 'Cannot do'],
       ['<b>Owner</b>', 'Everything: sell, stock, customers, debts, orders, reports. Cancel sales. Set the shop name and logo. Give staff access. Phone alerts.', '—'],
       ['<b>Storekeeper</b>', 'Sell, add and restock items, temporary stock, customers, record payments, orders, reports.', 'Cancel sales, change the shop profile, manage the team, phone alerts.'],
       ['<b>Supervisor</b> (view only)', 'See everything, download reports, phone alerts.', 'Change anything.'],
       ['<b>New account</b>', 'Sees "Waiting for approval" until the owner gives a role.', 'Everything else.']],
      [32 * mm, 80 * mm, 60 * mm])
tip('The owner gives access in <b>Settings → Team &amp; Access</b>. New staff accounts are created in Supabase '
    '(Authentication → Users → Add user) and then given a role there.')

# ─── 3 ───
h1('3. Logging in and installing on a phone')
h2('Logging in')
steps(['Open the Cunga Stock website.', 'Type your email and password and tap <b>Login</b>.',
       'You go straight to the Dashboard. To leave, tap your name → <b>Sign Out</b> (or the sign-out icon in the menu).'])
h2('Install it like an app (recommended for phones)')
table([['Phone', 'How to install'],
       ['Android — Chrome', 'Open the website, log in, tap <b>Install</b> on the dashboard card, or Chrome menu (three dots) <b>→ Install app</b> (or "Add to Home screen").'],
       ['Samsung Internet', 'Tap the download icon in the address bar, or the menu (three lines) <b>→ Add page to → Home screen</b>.'],
       ['iPhone — Safari', 'Tap <b>Share → Add to Home Screen</b>. Always open Cunga Stock from the home-screen icon.'],
       ['Computer', 'Chrome / Edge: click the install icon in the address bar, or use it in the browser.']],
      [40 * mm, 132 * mm])
p('The app then opens full screen from its own icon. Long-press the icon for shortcuts: <b>New Sale</b>, <b>Add Item</b>, <b>Debts</b>.')
h2('Updates — no reinstalling')
p('When a new version is published, the app picks it up by itself the next time it opens. If the app was left open, '
  'a bar says <b>"A new version is ready — Update now"</b>; tap it. You never need to uninstall or reinstall.')
warn('The app needs internet to save sales. Without internet a yellow bar says so; you can still look around.')

# ─── 4 ───
h1('4. Dashboard')
p('The first screen after logging in:')
steps(['<b>Sales Today</b> — money and number of sales today (tap to open Sales).',
       '<b>Out with Customers</b> — pieces on approval, and how many are late.',
       '<b>Owed to the Shop</b> — unpaid balances (tap to open Debts).',
       '<b>Need Restocking</b> — items low or sold out.',
       '<b>Quick Actions</b> — New Sale, Add Item, Out to Customer, Reports.',
       'Charts of stock by status and category, recent activity and low-stock alerts.'], numbered=False)

# ─── 5 ───
h1('5. Sales — selling at the till')
h2('Make a sale')
steps(['Open <b>Sales</b>. Search (e.g. "shirt M white") or scroll.',
       'Tap the colour / size the customer is buying. Tap again for another piece. On a phone a green bar at the bottom shows the total — tap <b>Checkout</b> to jump to the cart.',
       'In the cart, type the <b>agreed price</b> for each item (tap "Use usual price" if it is the normal price). Numbers show commas as you type (150,000).',
       'Optional: choose the <b>customer</b> (search, or type a new name and phone).',
       'Choose <b>Paid in full</b> or <b>Part / credit</b>, and the method: Cash, Mobile Money, Bank or Other. For credit, enter what they paid now and when they will pay the rest — a customer is required.',
       'Tap <b>Complete Sale</b>. The receipt opens: <b>Print</b>, <b>PDF</b>, or <b>Done — next customer</b>.'])
h2('Sell a full outfit (set)')
p('Tap <b>Outfit sets</b> at the top, choose the set, pick the colour and size of each part, then enter one price for the whole set. The receipt shows the set with its parts.')
h2('Find or reprint a receipt')
p('<b>Recent Sales</b> lists the latest sales with who sold them. Tap one to see, print or download the receipt.')
h2('Cancel a sale (owner only)')
steps(['Open the sale\'s receipt and tap <b>Cancel sale</b>.', 'Type why (e.g. "entered twice").',
       'The pieces go back into stock, any debt from it is removed, and the app tells you how much money to give back. The receipt stays in the records marked CANCELLED.'])
tip('Quick sale: in Stock, the menu of an item has <b>Quick sale</b> for one item without a receipt.')

# ─── 6 ───
h1('6. Stock — items, colours, sizes, photos, outfit sets')
p('One <b>item</b> is one design (e.g. "Slim fit shirt"). Every <b>colour × size</b> is counted separately, so "White M" and "Black L" are never mixed up.')
h2('Add an item (4 short steps)')
steps(['<b>Details</b>: optional photo (take one or choose from the gallery), name, category, selling price (same for every colour and size), what you paid ("Bought for"), and when to warn you that it is running low.',
       '<b>Colours</b>: tap every colour you have — you can choose several. The app suggests colours from the photo. Need a new colour? Tap <b>New colour</b>, pick the exact shade on the colour wheel and name it; it is saved for everyone.',
       '<b>Sizes</b>: tap every size (Clothing, Waist, Shoes, Kids tabs), or type another size.',
       '<b>How many</b>: enter pieces per colour and size, or use "Same for all". Tap <b>Save item</b>.'])
h2('Everyday actions')
table([['Action', 'Where'],
       ['Restock (new pieces came in)', '<b>Restock</b> button → choose colour/size → how many.'],
       ['New colour or size of an existing item', 'Item menu → <b>Add sizes / colours</b> (several at once).'],
       ['Change name, category, photo, price, cost', 'Pencil icon or menu → <b>Edit</b>. Different price per size/colour is possible.'],
       ['Delete an item', 'Item menu → <b>Delete item</b> (sales history is kept).'],
       ['Search', 'Type e.g. "jeans 32" or "shirt navy".']],
      [62 * mm, 110 * mm])
h2('Outfit sets')
p('Tab <b>Outfit sets → New Set</b>: name it (e.g. "Navy suit"), tick the items it is made of, and optionally the usual price of the full set. '
  'Each part keeps its own stock and can still be sold alone.')
warn('The price on an item is only the <b>usual</b> price. The real price is typed on every sale, so negotiated prices are always recorded correctly.')

# ─── 7 ───
h1('7. Categories')
p('Group clothes (Shirts, Dresses, Shoes…). Add, rename, recolour or delete in <b>Categories</b>. A new category can also be added while adding an item. '
  'An empty shop can add the usual clothing categories with one tap.')

# ─── 8 ───
h1('8. Temporary Stock — clothes out on approval')
p('For a customer who takes clothes to try at home or reserves them.')
steps(['Tap <b>Check Out Item</b>, choose the garment (colour/size), the customer, how many, and when they must bring it back ("Tomorrow", "In 3 days"…). Optional: deposit and notes.',
       'The pieces leave the shelf until the customer decides.',
       'When they come back: <b>Returned</b> → back in stock.',
       'If they keep it: <b>Sold</b> → enter the price and what they paid; any rest becomes a debt.'])
p('Late items are highlighted. The <b>History</b> and <b>Reports</b> tabs show past records and exports.')

# ─── 9 ───
h1('9. Customers')
p('Every customer picked or typed at a sale is saved. <b>Customers</b> shows each person\'s purchases, total spent, what they owe, and notes. '
  'Tap a customer to see everything they bought, record a payment, edit their details, or <b>Call</b> / <b>WhatsApp</b> them.')

# ─── 10 ───
h1('10. Debts (Amadeni)')
p('A debt is created automatically when a sale is <b>Part / credit</b>.')
steps(['<b>Debts</b> lists who owes what — late customers first, with totals for owed, overdue and collected this month.',
       '<b>Record payment</b>: enter the amount (Everything / Half / any amount) and the method. If a customer owes on several sales, the oldest is paid first. Or use <b>Pay this one</b> on a specific sale.',
       'Change a due date if the customer asks for more time.',
       '<b>WhatsApp</b> opens a polite reminder with the balance already written — just press send.'])

# ─── 11 ───
h1('11. Orders & Deliveries')
steps(['<b>New Order</b>: supplier (saved for next time), items with size, colour, pieces and cost each, when it should arrive, and how it is coming (bus, courier, envelope/parcel) with the parcel or tracking number. Also transport cost and what you paid the supplier.',
       'Follow it: <b>Ordered → On the way → Arrived</b>. Late deliveries are flagged. Each order shows <b>who placed it</b> and <b>who checked it in</b>.',
       'When goods arrive tap <b>Goods arrived</b> and count what actually came for each line. Only those pieces are added to stock; missing pieces stay expected. New sizes/colours are created automatically and cost prices updated.',
       '<b>Pay supplier</b> records money paid; the card shows what is still owed.'])
tip('New item that you have never sold? Add it in Stock first with 0 pieces, then order it.')

# ─── 12 ───
h1('12. Reports')
p('Choose a period (Today, This week, This month, Last month, This year or any dates). Every report downloads as <b>PDF</b> or <b>CSV</b> (opens in Excel).')
table([['Tab', 'What it shows'],
       ['Sales &amp; profit', 'Sales, profit and margin, money received by method, sold on credit, sales per day chart, best sellers by item / size / colour / category, stock value, items not selling.'],
       ['Cash vs credit', 'Per day: sold for, paid at the till, given on credit, debts paid back, money in by Cash / MoMo / Bank. Compare with the drawer each evening.'],
       ['Aged debts', 'Who owes and how late: not due, 1–30, 31–60, 61–90, over 90 days.'],
       ['Temporary stock', 'Pieces taken, bought, returned, still out or late; deposits held.'],
       ['Low stock', 'Items low or sold out, and single sizes/colours that ran out.'],
       ['Stock lists', 'Full stock list and movement history to export.']],
      [38 * mm, 134 * mm])
warn('Profit counts only pieces with a cost price ("Bought for"). Add it when adding or editing an item; orders fill it in automatically.')

# ─── 13 ───
h1('13. History')
p('Every stock change: added, sold, restocked, out on approval, back from customer, adjusted (e.g. cancelled sale) — with who did it and when.')

# ─── 14 ───
h1('14. Notifications and phone alerts')
h2('Inside the app')
p('The bell shows a red dot when something needs attention: low or sold-out stock, overdue payments, late deliveries, clothes not brought back. Tap it for the list.')
h2('Alerts on the owner\'s / supervisor\'s phone')
p('These arrive even when the app is closed, for example:')
story.append(Paragraph('<b>New sale · RWF 45,000</b><br/>Aline bought 2× Blue T-shirt (M, Black). Sold by Eloge. Paid · Mobile Money', TIP))
steps(['Install the app on the phone (Section 3). On iPhone, open it from the home-screen icon.',
       'Dashboard card or <b>Settings → Phone notifications → Turn on sale alerts</b>, then tap <b>Allow</b>. A test alert arrives.',
       'Choose what you want: every sale, cancelled sales, restock reminders, debts coming due (on the day or 1–7 days before), late payments, orders &amp; deliveries, temporary stock, yesterday\'s sales.',
       'Morning reminders arrive at <b>8:00</b>. Tapping an alert opens the right page (e.g. the receipt of that sale).'])
p('Storekeepers do not receive phone alerts. "Also notify me about things I do" lets the owner also get alerts for their own sales.')

# ─── 15 ───
h1('15. Settings')
table([['Section', 'What it does'],
       ['Profile', 'Your name and account details.'],
       ['Shop profile (owner)', 'Shop name, <b>logo</b>, tagline, location, phone, email, TIN and the message at the bottom of receipts. Used on receipts, report PDFs and WhatsApp messages. <b>Preview a receipt</b> shows the result.'],
       ['Phone notifications', 'Turn alerts on/off for this phone, send a test, choose the kinds of alerts.'],
       ['Team &amp; Access (owner)', 'Give new accounts a role, change or remove access.'],
       ['Appearance', 'Light / dark mode (also the sun/moon button at the top).']],
      [45 * mm, 127 * mm])

# ─── 16 ───
h1('16. Problems and answers')
qa = [
    ('I don\'t see the Install button.', 'Open the real website (not a preview link) in Chrome, Samsung Internet or Safari. If it is already installed, open it from the home screen.'),
    ('Phone alerts don\'t arrive.', 'Check Settings → Phone notifications says "On for this device" and send a test. On iPhone the app must be opened from the home-screen icon. If you tapped "Block", allow notifications again with the lock icon next to the website address.'),
    ('A sale was entered twice or by mistake.', 'The owner opens the receipt → Cancel sale. Stock comes back and the refund amount is shown.'),
    ('The price on the item is wrong.', 'Stock → Edit item → change the selling price. Past sales keep the price agreed at the time.'),
    ('A customer paid part of a debt.', 'Debts → Record payment → enter the amount. The rest stays owed.'),
    ('The supplier sent fewer pieces.', 'Orders → Goods arrived → enter what really came. The order stays "Part arrived" until the rest comes.'),
    ('A new staff member can\'t get in.', 'They see "Waiting for approval" until the owner gives them a role in Settings → Team & Access.'),
    ('No internet.', 'Look around freely; sales and changes need the internet. A yellow bar shows when you are offline.'),
    ('The screen looks old after an update.', 'Tap "Update now" on the blue bar, or close and reopen the app.'),
]
for q, a in qa:
    story.append(KeepTogether([Paragraph(f'<b>{q}</b>', P), Paragraph(a, P), Spacer(1, 3)]))

def footer(canvas, doc):
    if doc.page == 1:
        return
    canvas.saveState()
    canvas.setFont('Arial', 8)
    canvas.setFillColor(GREY)
    canvas.drawString(18 * mm, 10 * mm, 'Cunga Stock — Clothing Store · User Manual')
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f'Page {doc.page}')
    canvas.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                        title='Cunga Stock — User Manual', author='Cunga Stock')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print('ok', OUT)
