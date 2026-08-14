import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FileCheck2,
  FileText,
  ListTodo,
  PackageCheck,
  Plus,
  TrendingUp,
  UserPlus,
} from "lucide-react";

const metrics = [
  { label: "Open leads", value: "28", change: "+8.2%", note: "vs last month", icon: BriefcaseBusiness, tone: "blue", bars: [31, 42, 36, 53, 49, 66, 78] },
  { label: "Quotes awaiting action", value: "9", change: "+3", note: "need follow-up", icon: FileText, tone: "violet", bars: [60, 46, 62, 41, 72, 55, 43] },
  { label: "Active jobs", value: "16", change: "+12.5%", note: "this month", icon: PackageCheck, tone: "green", bars: [32, 38, 48, 54, 58, 71, 76] },
  { label: "Overdue tasks", value: "7", change: "3 urgent", note: "action required", icon: ListTodo, tone: "orange", bars: [72, 68, 57, 54, 41, 38, 29] },
];

const activity = [
  { initials: "JL", name: "James Lawson", text: "submitted a new blinds enquiry", time: "3 min ago", tone: "blue" },
  { initials: "SC", name: "Sarah Chen", text: "accepted quotation QT-1082", time: "18 min ago", tone: "green" },
  { initials: "MK", name: "Mike Khan", text: "completed installation JOB-2041", time: "42 min ago", tone: "violet" },
  { initials: "ER", name: "Emma Roberts", text: "paid invoice INV-0952", time: "1 hr ago", tone: "orange" },
];

const jobs = [
  { id: "JOB-2048", client: "Williams Residence", type: "Plantation shutters", date: "15 Aug", installer: "MK", status: "Scheduled" },
  { id: "JOB-2045", client: "North & Co. Offices", type: "Roller blinds", date: "16 Aug", installer: "TA", status: "Ready" },
  { id: "JOB-2041", client: "Emma Roberts", type: "Venetian blinds", date: "Today", installer: "MK", status: "Review" },
  { id: "JOB-2039", client: "Harrison Suite", type: "Blackout blinds", date: "18 Aug", installer: "RS", status: "Picking" },
];

const schedule = [
  { time: "09:00", title: "Williams survey visit", meta: "Mike Khan · SW11", tone: "blue" },
  { time: "11:30", title: "Quotation follow-up", meta: "Sarah Chen · Phone", tone: "violet" },
  { time: "14:00", title: "North & Co. installation", meta: "Tom Adams · EC2A", tone: "green" },
  { time: "16:30", title: "Stock collection", meta: "Mike Khan · Main warehouse", tone: "orange" },
];

function MiniBars({ values }: { values: number[] }) {
  return (
    <div className="mini-bars" aria-hidden="true">
      {values.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
    </div>
  );
}

export function DashboardView({ name }: { name: string }) {
  const firstName = name.split(" ")[0];
  return (
    <div className="dashboard-page">
      <div className="page-intro">
        <div>
          <h2>Good afternoon, {firstName} <span>👋</span></h2>
          <p>Here&apos;s what&apos;s happening across your business today.</p>
        </div>
        <div className="intro-actions">
          <button className="secondary-button"><CalendarDays size={16} /> 14 Aug 2026</button>
          <Link href="/leads" className="primary-button"><Plus size={17} /> New lead</Link>
        </div>
      </div>

      <section className="metric-grid" aria-label="Operational metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="metric-card" key={metric.label}>
              <div className={`metric-icon ${metric.tone}`}><Icon size={19} /></div>
              <button aria-label={`More options for ${metric.label}`}>•••</button>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <div className="metric-foot">
                <p><b className={metric.tone === "orange" ? "warning" : "positive"}>{metric.change}</b> {metric.note}</p>
                <MiniBars values={metric.bars} />
              </div>
            </article>
          );
        })}
      </section>

      <div className="dashboard-grid">
        <section className="panel performance-panel">
          <div className="panel-head">
            <div><h3>Sales performance</h3><p>Lead conversion and quotation value</p></div>
            <div className="segmented"><button>Week</button><button className="active">Month</button><button>Year</button></div>
          </div>
          <div className="chart-summary">
            <div><span>Pipeline value</span><strong>£89,420</strong><small><TrendingUp size={13} /> 14.8%</small></div>
            <div><span>Won this month</span><strong>£24,860</strong><small><TrendingUp size={13} /> 9.2%</small></div>
            <div><span>Conversion rate</span><strong>31.6%</strong><small><TrendingUp size={13} /> 2.4%</small></div>
          </div>
          <div className="area-chart" aria-label="Monthly sales performance chart">
            <div className="y-axis"><span>£30k</span><span>£20k</span><span>£10k</span><span>£0</span></div>
            <svg viewBox="0 0 760 210" preserveAspectRatio="none" role="img">
              <defs>
                <linearGradient id="areaBlue" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#445ce7" stopOpacity=".24"/><stop offset="1" stopColor="#445ce7" stopOpacity="0"/></linearGradient>
                <linearGradient id="areaGreen" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#18a977" stopOpacity=".14"/><stop offset="1" stopColor="#18a977" stopOpacity="0"/></linearGradient>
              </defs>
              <g className="grid-lines"><line x1="0" y1="18" x2="760" y2="18"/><line x1="0" y1="76" x2="760" y2="76"/><line x1="0" y1="134" x2="760" y2="134"/><line x1="0" y1="192" x2="760" y2="192"/></g>
              <path className="chart-fill blue" d="M0 172 C48 166,65 144,110 149 S176 132,220 137 S290 102,335 112 S402 78,447 90 S520 45,565 62 S633 34,680 44 S724 25,760 30 L760 210 L0 210 Z" fill="url(#areaBlue)"/>
              <path className="chart-line blue" d="M0 172 C48 166,65 144,110 149 S176 132,220 137 S290 102,335 112 S402 78,447 90 S520 45,565 62 S633 34,680 44 S724 25,760 30"/>
              <path className="chart-fill green" d="M0 188 C50 176,68 181,112 172 S176 165,221 168 S290 143,336 151 S402 130,448 138 S520 108,566 120 S634 88,680 97 S724 72,760 82 L760 210 L0 210 Z" fill="url(#areaGreen)"/>
              <path className="chart-line green" d="M0 188 C50 176,68 181,112 172 S176 165,221 168 S290 143,336 151 S402 130,448 138 S520 108,566 120 S634 88,680 97 S724 72,760 82"/>
            </svg>
            <div className="x-axis"><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span></div>
          </div>
          <div className="chart-legend"><span><i className="blue" /> Pipeline</span><span><i className="green" /> Won</span></div>
        </section>

        <section className="panel activity-panel">
          <div className="panel-head"><div><h3>Recent activity</h3><p>Latest updates from your team</p></div><Link href="/admin/audit">View all</Link></div>
          <div className="activity-list">
            {activity.map((item) => (
              <div className="activity-item" key={item.name + item.time}>
                <span className={`activity-avatar ${item.tone}`}>{item.initials}</span>
                <p><strong>{item.name}</strong><span>{item.text}</span><small><Clock3 size={12} /> {item.time}</small></p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel jobs-panel">
          <div className="panel-head"><div><h3>Upcoming jobs</h3><p>Installations and surveys requiring attention</p></div><Link href="/jobs">View all <ArrowRight size={14} /></Link></div>
          <div className="table-wrap">
            <table className="data-table dashboard-table">
              <thead><tr><th>Job</th><th>Customer</th><th>Service</th><th>Date</th><th>Installer</th><th>Status</th></tr></thead>
              <tbody>{jobs.map((job) => (
                <tr key={job.id}><td><Link href="/jobs">{job.id}</Link></td><td><strong>{job.client}</strong></td><td>{job.type}</td><td>{job.date}</td><td><span className="tiny-avatar">{job.installer}</span></td><td><span className={`status ${job.status.toLowerCase()}`}>{job.status}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="mobile-job-list">{jobs.map((job) => <div key={job.id}><span className="tiny-avatar">{job.installer}</span><p><strong>{job.client}</strong><small>{job.id} · {job.type}</small></p><span className={`status ${job.status.toLowerCase()}`}>{job.status}</span></div>)}</div>
        </section>

        <section className="panel schedule-panel">
          <div className="panel-head"><div><h3>Today&apos;s schedule</h3><p>Thursday, 14 August</p></div><Link href="/calendar"><CalendarDays size={16} /></Link></div>
          <div className="schedule-list">{schedule.map((item) => <div key={item.time}><time>{item.time}</time><i className={item.tone}/><p><strong>{item.title}</strong><small>{item.meta}</small></p></div>)}</div>
        </section>
      </div>

      <section className="quick-actions">
        <div><h3>Quick actions</h3><p>Jump straight into common workflows</p></div>
        <nav>
          <Link href="/leads"><span className="blue"><UserPlus size={18}/></span><b>New lead</b><small>Add an enquiry</small></Link>
          <Link href="/quotations"><span className="violet"><FileCheck2 size={18}/></span><b>Create quote</b><small>Build a quotation</small></Link>
          <Link href="/tasks"><span className="green"><ListTodo size={18}/></span><b>Add task</b><small>Plan follow-up</small></Link>
          <Link href="/inventory"><span className="orange"><Boxes size={18}/></span><b>Check stock</b><small>View low inventory</small></Link>
        </nav>
      </section>
    </div>
  );
}
