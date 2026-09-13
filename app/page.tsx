'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Scale, Building2, Truck, ShieldAlert, Plus, History, 
  Printer, CheckCircle, Search, Scissors, Download, AlertTriangle 
} from 'lucide-react';

export default function BigBagApp() {
  const [role, setRole] = useState<'site' | 'office' | 'owner'>('site');
  const [activeTab, setActiveTab] = useState<'bags' | 'dispatch' | 'audit'>('bags');
  const [bags, setBags] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [showNewBagModal, setShowNewBagModal] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printType, setPrintType] = useState<'twin' | '80mm' | 'A4'>('twin');
  
  // Selected State
  const [activeBag, setActiveBag] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  
  // Form State
  const [newItemName, setNewItemName] = useState('เกล็ดพลาสติก PET บดใส-ฟ้า A');
  const [addedWeight, setAddedWeight] = useState('');
  const [editWeightVal, setEditWeightVal] = useState('');
  const [editReason, setEditReason] = useState('');
  
  // Dispatch Scale State
  const [plate, setPlate] = useState('70-9876 อุดรธานี');
  const [customer, setCustomer] = useState('บจก. ไทยโพลีเมอร์ พลาสติก');
  const [gross, setGross] = useState<number>(12320);
  const [tare, setTare] = useState<number>(7240);
  const [selectedDispatchBags, setSelectedDispatchBags] = useState<string[]>([]);

  useEffect(() => {
    fetchBags();
    fetchAuditLogs();
  }, [role]);

  // ดึงข้อมูลตามสิทธิ์ (Data Isolation)
  async function fetchBags() {
    let tableName = 'view_site_bags';
    if (role === 'office') tableName = 'view_office_bags';
    if (role === 'owner') tableName = 'view_owner_dash';

    const { data } = await supabase.from(tableName).select('*').order('updated_at', { ascending: false });
    if (data) setBags(data);
  }

  async function fetchAuditLogs() {
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
    if (data) setAuditLogs(data);
  }

  // เปิดถุงใหม่ & รหัสถุง
  async function handleCreateBag() {
    const nextId = `BAG-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(bags.length + 1).padStart(3, '0')}`;
    const newBag = {
      bag_id: nextId,
      item_name: newItemName,
      status: 'Active',
      site_weight: 0,
      office_weight: 0
    };

    const { error } = await supabase.from('bigbags').insert(newBag);
    if (!error) {
      await supabase.from('audit_logs').insert({
        bag_id: nextId,
        editor_role: role,
        field_name: 'status',
        old_value: '-',
        new_value: 'Active',
        reason: 'เปิดถุง Big Bag ใหม่และพิมพ์สติกเกอร์บาร์โค้ดคู่'
      });
      setShowNewBagModal(false);
      fetchBags();
      setActiveBag(newBag);
      setPrintType('twin');
      setShowPrintModal(true);
    }
  }

  // เปิดไทม์ไลน์รายวัน
  async function openTimeline(bag: any) {
    setActiveBag(bag);
    setEditWeightVal(role === 'office' ? String(bag.office_weight || 0) : String(bag.site_weight || 0));
    setEditReason('');
    const { data } = await supabase.from('bag_timelines').select('*').eq('bag_id', bag.bag_id).order('record_date', { ascending: true });
    setTimeline(data || []);
    setShowTimelineModal(true);
  }

  // บันทึกชั่งสะสมรอบวัน
  async function handleAddDailyWeight() {
    if (!addedWeight || !activeBag) return;
    const w = parseFloat(addedWeight);
    const isOffice = role === 'office';

    await supabase.from('bag_timelines').insert({
      bag_id: activeBag.bag_id,
      site_added: isOffice ? 0 : w,
      office_billed: isOffice ? w : 0,
      note: `บันทึกผ่านระบบ (${role})`
    });

    const currentTotal = isOffice ? (activeBag.office_weight || 0) : (activeBag.site_weight || 0);
    const newTotal = currentTotal + w;

    await supabase.from('bigbags').update(
      isOffice ? { office_weight: newTotal } : { site_weight: newTotal }
    ).eq('bag_id', activeBag.bag_id);

    setAddedWeight('');
    openTimeline(activeBag);
    fetchBags();
  }

  // แก้ไขค่าน้ำหนักสะสมพร้อมบันทึก Audit Log
  async function handleSaveEditWeight() {
    if (!editReason.trim()) {
      alert('จำเป็นต้องระบุเหตุผลในการแก้ไขข้อมูล');
      return;
    }
    const newWeight = parseFloat(editWeightVal) || 0;
    const isOffice = role === 'office';
    const oldWeight = isOffice ? activeBag.office_weight : activeBag.site_weight;

    await supabase.from('bigbags').update(
      isOffice ? { office_weight: newWeight } : { site_weight: newWeight }
    ).eq('bag_id', activeBag.bag_id);

    await supabase.from('audit_logs').insert({
      bag_id: activeBag.bag_id,
      editor_role: role,
      field_name: isOffice ? 'office_weight' : 'site_weight',
      old_value: String(oldWeight),
      new_value: String(newWeight),
      reason: editReason
    });

    setShowTimelineModal(false);
    fetchBags();
    fetchAuditLogs();
    alert('บันทึกการแก้ไขและจัดเก็บประวัติลง Audit Trail เรียบร้อยแล้ว');
  }

  // ปิดปากถุง (Sealed)
  async function handleSealBag(bagId: string) {
    if (confirm(`ยืนยันเย็บปิดปากถุง ${bagId} หรือไม่?`)) {
      await supabase.from('bigbags').update({ status: 'Sealed' }).eq('bag_id', bagId);
      await supabase.from('audit_logs').insert({
        bag_id: bagId,
        editor_role: role,
        field_name: 'status',
        old_value: 'Active',
        new_value: 'Sealed',
        reason: 'หน้างานบรรจุเต็มและเย็บปิดปากถุงเรียบร้อย'
      });
      fetchBags();
    }
  }

  // ส่งออก CSV สำหรับเจ้าของ
  function exportAuditCSV() {
    let csv = "Timestamp,BagID,Role,Field,OldValue,NewValue,Reason\n";
    auditLogs.forEach(l => {
      csv += `"${l.created_at}","${l.bag_id}","${l.editor_role}","${l.field_name}","${l.old_value}","${l.new_value}","${l.reason.replace(/"/g, '""')}"\n`;
    });
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const filteredBags = bags.filter(b => 
    b.bag_id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    b.item_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const netTruckScale = gross - tare;
  const totalSiteDispatched = selectedDispatchBags.reduce((acc, id) => {
    const b = bags.find(x => x.bag_id === id);
    return acc + (b?.site_weight || 0);
  }, 0);
  const dispatchVariance = netTruckScale - totalSiteDispatched;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-12">
      {/* 1. TOP NAVBAR & ROLE SWITCHER */}
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-base md:text-lg leading-tight">ระบบบริหารน้ำหนัก Big Bag & ขนส่ง</h1>
              <p className="text-xs text-slate-400">Blind Double-Entry & Audit System</p>
            </div>
          </div>

          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
            <span className="text-xs text-slate-400 px-2 font-medium">สลับบทบาท:</span>
            <button 
              onClick={() => setRole('site')} 
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${role === 'site' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}>
              หน้างาน
            </button>
            <button 
              onClick={() => setRole('office')} 
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${role === 'office' ? 'bg-purple-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}>
              ออฟฟิศ / ตัดขาย
            </button>
            <button 
              onClick={() => setRole('owner')} 
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${role === 'owner' ? 'bg-emerald-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}>
              เจ้าของ / Audit
            </button>
          </div>
        </div>
      </header>

      {/* 2. ROLE INDICATOR BANNER */}
      <div className="max-w-7xl mx-auto px-4 mt-4">
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs md:text-sm font-medium ${
          role === 'site' ? 'bg-blue-50 border-blue-200 text-blue-900' :
          role === 'office' ? 'bg-purple-50 border-purple-200 text-purple-900' :
          'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          <div className="flex items-center gap-2">
            {role === 'site' && <Scale className="w-4 h-4 text-blue-600" />}
            {role === 'office' && <Building2 className="w-4 h-4 text-purple-600" />}
            {role === 'owner' && <ShieldAlert className="w-4 h-4 text-emerald-600" />}
            <span>
              {role === 'site' && 'มุมมองหน้างาน: บันทึกและชั่งสะสมจริง (ซ่อนตัวเลขคิดเงินของออฟฟิศ 100%)'}
              {role === 'office' && 'มุมมองออฟฟิศ/ชั่งรถ: บันทึกยอดออกบิลและตัดขาย (ซ่อนน้ำหนักหน้างานจริง 100%)'}
              {role === 'owner' && 'มุมมองเจ้าของ: ตรวจสอบผลต่างน้ำหนัก 3 ทาง และดูสมุดประวัติการแก้ไข (Audit Trail)'}
            </span>
          </div>
          {role === 'site' && (
            <button 
              onClick={() => setShowNewBagModal(true)} 
              className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-blue-700 flex items-center gap-1 shadow">
              <Plus className="w-3.5 h-3.5" /> เปิดถุงใหม่
            </button>
          )}
        </div>
      </div>

      {/* 3. TABS NAVIGATION */}
      <main className="max-w-7xl mx-auto px-4 mt-6">
        <div className="flex border-b border-slate-200 space-x-4 mb-6">
          <button 
            onClick={() => setActiveTab('bags')} 
            className={`pb-2 text-sm font-bold flex items-center gap-1.5 border-b-2 transition ${activeTab === 'bags' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>
            <Scale className="w-4 h-4" /> ทะเบียน Big Bag
          </button>
          <button 
            onClick={() => setActiveTab('dispatch')} 
            className={`pb-2 text-sm font-bold flex items-center gap-1.5 border-b-2 transition ${activeTab === 'dispatch' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>
            <Truck className="w-4 h-4" /> ตัดขาย & ชั่งรถบรรทุก
          </button>
          {role === 'owner' && (
            <button 
              onClick={() => setActiveTab('audit')} 
              className={`pb-2 text-sm font-bold flex items-center gap-1.5 border-b-2 transition ${activeTab === 'audit' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500'}`}>
              <ShieldAlert className="w-4 h-4" /> สมุดประวัติ Audit Logs
            </button>
          )}
        </div>

        {/* TAB 1: BAG MANAGEMENT */}
        {activeTab === 'bags' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="สแกนหรือพิมพ์ค้นหารหัส Big Bag..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b text-slate-600 uppercase font-semibold">
                    <tr>
                      <th className="p-3">รหัส Big Bag</th>
                      <th className="p-3">รายการสินค้า</th>
                      <th className="p-3">สถานะ</th>
                      {role !== 'office' && <th className="p-3 text-right">น้ำหนักหน้างาน (กก.)</th>}
                      {role !== 'site' && <th className="p-3 text-right">น้ำหนักออฟฟิศ (กก.)</th>}
                      {role === 'owner' && <th className="p-3 text-right">ผลต่าง (Variance)</th>}
                      <th className="p-3 text-center">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBags.map(bag => (
                      <tr key={bag.bag_id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-indigo-700">{bag.bag_id}</td>
                        <td className="p-3">{bag.item_name}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            bag.status === 'Active' ? 'bg-blue-100 text-blue-700' :
                            bag.status === 'Sealed' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {bag.status}
                          </span>
                        </td>
                        {role !== 'office' && <td className="p-3 text-right font-bold text-slate-800">{Number(bag.site_weight).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>}
                        {role !== 'site' && <td className="p-3 text-right font-bold text-slate-800">{Number(bag.office_weight).toLocaleString('th-TH', {minimumFractionDigits: 2})}</td>}
                        {role === 'owner' && (
                          <td className={`p-3 text-right font-bold ${bag.variance_weight < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {bag.variance_weight > 0 ? '+' : ''}{bag.variance_weight} ({bag.variance_pct}%)
                          </td>
                        )}
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button 
                              onClick={() => openTimeline(bag)} 
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-indigo-700 font-semibold flex items-center gap-1">
                              <History className="w-3 h-3" /> ประวัติ/แก้ไข
                            </button>
                            {role === 'site' && bag.status === 'Active' && (
                              <button 
                                onClick={() => handleSealBag(bag.bag_id)} 
                                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold">
                                ปิดถุง
                              </button>
                            )}
                            <button 
                              onClick={() => { setActiveBag(bag); setPrintType('twin'); setShowPrintModal(true); }} 
                              className="p-1 text-slate-400 hover:text-slate-700">
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DISPATCH & SCALE */}
        {activeTab === 'dispatch' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
                <Truck className="w-4 h-4 text-indigo-600" /> บันทึกชั่งรถบรรทุก (Truck Scale)
              </h2>
              <div>
                <label className="text-xs text-slate-500 font-semibold block mb-1">ทะเบียนรถ</label>
                <input type="text" value={plate} onChange={(e) => setPlate(e.target.value)} className="w-full text-xs border rounded-lg p-2 font-bold" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold block mb-1">ชื่อลูกค้า / ปลายทาง</label>
                <input type="text" value={customer} onChange={(e) => setCustomer(e.target.value)} className="w-full text-xs border rounded-lg p-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-semibold block mb-1">รถหนัก (Gross kg)</label>
                  <input type="number" value={gross} onChange={(e) => setGross(Number(e.target.value))} className="w-full text-xs border rounded-lg p-2 font-bold" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-semibold block mb-1">รถเปล่า (Tare kg)</label>
                  <input type="number" value={tare} onChange={(e) => setTare(Number(e.target.value))} className="w-full text-xs border rounded-lg p-2 font-bold" />
                </div>
              </div>
              <div className="p-3 bg-slate-50 border rounded-lg">
                <div className="text-xs text-slate-500">สุทธิตาชั่งรถ (Net Scale)</div>
                <div className="text-lg font-bold text-indigo-600">{netTruckScale.toLocaleString('th-TH', {minimumFractionDigits: 2})} กก.</div>
              </div>
              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => { setPrintType('80mm'); setShowPrintModal(true); }} 
                  className="flex-1 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 flex items-center justify-center gap-1">
                  <Printer className="w-3.5 h-3.5" /> พิมพ์สลิป 80mm
                </button>
                <button 
                  onClick={() => { setPrintType('A4'); setShowPrintModal(true); }} 
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center justify-center gap-1">
                  <Printer className="w-3.5 h-3.5" /> ใบส่งของ A4
                </button>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="font-bold text-sm text-slate-800 border-b pb-2">เลือก Big Bag ที่ยกขึ้นรถคันนี้</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1">
                {bags.filter(b => b.status !== 'Dispatched').map(bag => (
                  <label key={bag.bag_id} className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer ${
                    selectedDispatchBags.includes(bag.bag_id) ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'
                  }`}>
                    <div>
                      <div className="font-mono font-bold text-indigo-900">{bag.bag_id}</div>
                      <div className="text-slate-500">{bag.item_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{bag.site_weight || 0} กก.</div>
                      <input 
                        type="checkbox" 
                        checked={selectedDispatchBags.includes(bag.bag_id)} 
                        onChange={(e) => {
                          if (e.target.checked) setSelectedDispatchBags([...selectedDispatchBags, bag.bag_id]);
                          else setSelectedDispatchBags(selectedDispatchBags.filter(id => id !== bag.bag_id));
                        }}
                        className="mt-1"
                      />
                    </div>
                  </label>
                ))}
              </div>

              {/* เปรียบเทียบผลต่างการขึ้นรถ */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border text-xs">
                <div>
                  <span className="text-slate-500 block">รวมหน้างานส่งมอบ:</span>
                  <span className="font-bold text-slate-800 text-sm">{totalSiteDispatched.toLocaleString()} กก.</span>
                </div>
                <div>
                  <span className="text-slate-500 block">สุทธิตาชั่งรถ:</span>
                  <span className="font-bold text-slate-800 text-sm">{netTruckScale.toLocaleString()} กก.</span>
                </div>
                <div>
                  <span className="text-slate-500 block">ผลต่าง (ตาชั่ง - หน้างาน):</span>
                  <span className={`font-bold text-sm ${Math.abs(dispatchVariance) > 50 ? 'text-rose-600' : 'text-slate-800'}`}>
                    {dispatchVariance > 0 ? '+' : ''}{dispatchVariance.toLocaleString()} กก.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT TRAIL LOGS */}
        {activeTab === 'audit' && role === 'owner' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-3 p-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-emerald-600" /> สมุดประวัติ Audit Trail ย้อนหลัง
              </h2>
              <button 
                onClick={exportAuditCSV} 
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1">
                <Download className="w-3.5 h-3.5" /> ส่งออก CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2.5">วัน-เวลา</th>
                    <th className="p-2.5">รหัสถุง</th>
                    <th className="p-2.5">ผู้แก้ไข</th>
                    <th className="p-2.5">คอลัมน์</th>
                    <th className="p-2.5 text-right">ค่าเดิม</th>
                    <th className="p-2.5 text-right">ค่าใหม่</th>
                    <th className="p-2.5">เหตุผล</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-2.5 text-slate-500">{new Date(log.created_at).toLocaleString('th-TH')}</td>
                      <td className="p-2.5 font-mono font-bold text-indigo-600">{log.bag_id}</td>
                      <td className="p-2.5 uppercase font-semibold">{log.editor_role}</td>
                      <td className="p-2.5">{log.field_name}</td>
                      <td className="p-2.5 text-right text-rose-600">{log.old_value}</td>
                      <td className="p-2.5 text-right text-emerald-600 font-bold">{log.new_value}</td>
                      <td className="p-2.5 text-slate-600 italic">{log.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: TIMELINE & EDIT WEIGHT */}
      {showTimelineModal && activeBag && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" /> ประวัติบรรจุ & แก้ไข: {activeBag.bag_id}
              </h3>
              <button onClick={() => setShowTimelineModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {/* Daily Packing Records */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">ประวัติการชั่งรายวัน</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {timeline.map((entry, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg border bg-slate-50 text-xs flex justify-between">
                    <div>
                      <span className="font-bold text-slate-700">{entry.record_date}</span>
                      <span className="text-slate-400 ml-2">{entry.note}</span>
                    </div>
                    <div className="font-bold">
                      {role !== 'office' && <span>หน้างาน: {entry.site_added} กก. </span>}
                      {role !== 'site' && <span className="ml-2">ออฟฟิศ: {entry.office_billed} กก.</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add weight input */}
              <div className="flex gap-2 mt-3">
                <input 
                  type="number" 
                  placeholder={`บันทึกน้ำหนักเพิ่ม (${role === 'office' ? 'ออฟฟิศ' : 'หน้างาน'})`} 
                  value={addedWeight}
                  onChange={(e) => setAddedWeight(e.target.value)}
                  className="flex-1 text-xs border rounded-lg p-2"
                />
                <button 
                  onClick={handleAddDailyWeight} 
                  className="bg-indigo-600 text-white px-3 text-xs font-bold rounded-lg hover:bg-indigo-700">
                  + บันทึกรอบชั่ง
                </button>
              </div>
            </div>

            <hr />

            {/* Direct Edit with Reason */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="text-xs font-bold text-amber-900">แก้ไขน้ำหนักสะสมรวม (Audit Trail Required)</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-600 block mb-1">ค่าน้ำหนักใหม่ (กก.)</label>
                  <input 
                    type="number" 
                    value={editWeightVal} 
                    onChange={(e) => setEditWeightVal(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2 font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600 block mb-1">เหตุผลในการแก้ไข</label>
                  <input 
                    type="text" 
                    placeholder="เช่น ชั่งทวนสอบซ้ำ, คีย์เลขสลับ" 
                    value={editReason} 
                    onChange={(e) => setEditReason(e.target.value)}
                    className="w-full text-xs border rounded-lg p-2"
                  />
                </div>
              </div>
              <button 
                onClick={handleSaveEditWeight} 
                className="w-full py-2 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700">
                บันทึกการแก้ไขลงสมุด Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: OPEN NEW BAG */}
      {showNewBagModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-base text-slate-800">เปิดถุง Big Bag ใหม่</h3>
            <div>
              <label className="text-xs text-slate-500 font-semibold block mb-1">ชนิดสินค้า</label>
              <input 
                type="text" 
                value={newItemName} 
                onChange={(e) => setNewItemName(e.target.value)} 
                className="w-full text-xs border rounded-lg p-2"
              />
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
              ระบบจะสั่งพิมพ์สติกเกอร์บาร์โค้ดคู่ (Twin Labels) ทันทีที่สร้างเสร็จ
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewBagModal(false)} className="px-3 py-1.5 text-xs text-slate-600">ยกเลิก</button>
              <button onClick={handleCreateBag} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700">
                สร้างถุง & พิมพ์ป้ายคู่
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PRINT ENGINE (TWIN TAG / 80MM / A4) */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3 no-print">
              <h3 className="font-bold text-base text-slate-800">ตัวอย่างเอกสารสำหรับพิมพ์</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-indigo-600 text-white px-3 py-1 text-xs font-bold rounded-lg">
                  พิมพ์เอกสาร
                </button>
                <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
            </div>

            {/* TWIN TAG PREVIEW */}
            {printType === 'twin' && activeBag && (
              <div className="border-2 border-dashed p-4 rounded-xl space-y-4 bg-white">
                <div className="border-2 border-black p-3 rounded-lg bg-slate-50">
                  <div className="text-xs font-bold bg-black text-white px-2 py-0.5 inline-block rounded">ใบที่ 1: หน้างาน (ติดถุง Big Bag)</div>
                  <div className="flex justify-between items-center mt-2">
                    <div>
                      <div className="font-mono text-xl font-black">{activeBag.bag_id}</div>
                      <div className="text-xs font-semibold mt-1">{activeBag.item_name}</div>
                    </div>
                    <div className="border p-2 text-center text-[10px] font-bold">QR / BARCODE</div>
                  </div>
                </div>
                <div className="border-t-2 border-dashed flex justify-center text-xs text-slate-400 py-1">
                  <Scissors className="w-3.5 h-3.5 mr-1" /> ฉีกแบ่งตามรอยประ
                </div>
                <div className="border-2 border-black p-3 rounded-lg">
                  <div className="text-xs font-bold bg-indigo-600 text-white px-2 py-0.5 inline-block rounded">ใบที่ 2: ออฟฟิศ (เก็บเข้าแฟ้มคิดเงิน)</div>
                  <div className="flex justify-between items-center mt-2">
                    <div>
                      <div className="font-mono text-xl font-black">{activeBag.bag_id}</div>
                      <div className="text-xs font-semibold mt-1">{activeBag.item_name}</div>
                    </div>
                    <div className="border p-2 text-center text-[10px] font-bold">OFFICE TAG</div>
                  </div>
                </div>
              </div>
            )}

            {/* 80MM SLIP PREVIEW */}
            {printType === '80mm' && (
              <div className="w-[76mm] mx-auto border p-3 text-xs space-y-2 bg-white">
                <div className="text-center font-bold">ใบชั่งน้ำหนัก / ใบส่งมอบสินค้า</div>
                <hr className="border-dashed" />
                <div>ทะเบียนรถ: <strong>{plate}</strong></div>
                <div>ลูกค้า: {customer}</div>
                <hr className="border-dashed" />
                <div className="font-bold">รายการถุง (น้ำหนักหน้างานส่งมอบ):</div>
                {selectedDispatchBags.map((id, i) => {
                  const b = bags.find(x => x.bag_id === id);
                  return (
                    <div key={id} className="flex justify-between text-[11px]">
                      <span>{i + 1}. {id}</span>
                      <span>{b?.site_weight || 0} กก.</span>
                    </div>
                  );
                })}
                <div className="p-1 border font-bold flex justify-between bg-slate-50">
                  <span>รวมส่งมอบ:</span>
                  <span>{totalSiteDispatched} กก.</span>
                </div>
                <hr className="border-dashed" />
                <div className="flex justify-between"><span>รถหนัก:</span><span>{gross} กก.</span></div>
                <div className="flex justify-between"><span>รถเปล่า:</span><span>{tare} กก.</span></div>
                <div className="flex justify-between font-bold text-sm"><span>สุทธิตาชั่ง:</span><span>{netTruckScale} กก.</span></div>
                <div className="pt-4 flex justify-between text-center text-[10px]">
                  <div>ผู้จ่ายของ<br /><br />...................</div>
                  <div>คนขับรถ<br /><br />...................</div>
                </div>
              </div>
            )}

            {/* A4 CERTIFICATE PREVIEW */}
            {printType === 'A4' && (
              <div className="border p-6 text-xs space-y-4 bg-white">
                <div className="flex justify-between border-b-2 border-indigo-900 pb-3">
                  <div>
                    <h2 className="font-bold text-lg text-indigo-950">ใบส่งของและใบรับรองการชั่งน้ำหนัก</h2>
                    <p className="text-slate-500 text-xs">เอกสารส่งมอบสินค้าต้นทาง</p>
                  </div>
                  <div className="text-right">
                    <div>วันที่: {new Date().toLocaleDateString('th-TH')}</div>
                    <div>ทะเบียนรถ: <strong>{plate}</strong></div>
                  </div>
                </div>

                <div className="p-2 bg-slate-50 rounded border">
                  <strong>ลูกค้า / ปลายทาง:</strong> {customer}
                </div>

                <table className="w-full border text-left">
                  <thead className="bg-indigo-50 border-b">
                    <tr>
                      <th className="p-2 border">ลำดับ</th>
                      <th className="p-2 border">รหัส Big Bag</th>
                      <th className="p-2 border text-right">น้ำหนักหน้างานส่งมอบ (กก.)</th>
                      <th className="p-2 border text-center">ผลชั่งปลายทาง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDispatchBags.map((id, idx) => {
                      const b = bags.find(x => x.bag_id === id);
                      return (
                        <tr key={id} className="border-b">
                          <td className="p-2 border">{idx + 1}</td>
                          <td className="p-2 border font-mono font-bold">{id}</td>
                          <td className="p-2 border text-right font-bold">{b?.site_weight || 0}</td>
                          <td className="p-2 border"></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold">
                      <td colSpan={2} className="p-2 border text-right">รวมน้ำหนักส่งมอบ:</td>
                      <td className="p-2 border text-right text-indigo-700">{totalSiteDispatched} กก.</td>
                      <td className="p-2 border"></td>
                    </tr>
                  </tfoot>
                </table>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="border p-3 rounded">
                    <strong>ผลชั่งตาชั่งรถบรรทุก (Truck Scale):</strong>
                    <div className="flex justify-between mt-1"><span>รถหนัก:</span><span>{gross} กก.</span></div>
                    <div className="flex justify-between"><span>รถเปล่า:</span><span>{tare} กก.</span></div>
                    <div className="flex justify-between font-bold border-t pt-1"><span>สุทธิ:</span><span>{netTruckScale} กก.</span></div>
                  </div>
                  <div className="border border-dashed p-3 rounded text-slate-500">
                    * ใช้น้ำหนักบรรจุหน้างาน (Site Weight) เป็นเกณฑ์ส่งมอบ กรุณาตรวจรับสภาพถุงและทวนสอบ ณ จุดลงสินค้า
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6 text-center pt-8 text-[11px]">
                  <div>.......................................<br />ผู้บันทึกชั่งหน้างาน</div>
                  <div>.......................................<br />พนักงานขับรถขนส่ง</div>
                  <div>.......................................<br />ผู้รับมอบปลายทาง</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
