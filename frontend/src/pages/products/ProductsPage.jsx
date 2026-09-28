import { useState, useEffect, useRef } from 'react'
import { Plus, Search, Edit, Trash2, Package, ImageIcon, X } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { BACKEND_URL } from '../../services/config'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'

const CATEGORIES = {
  laptop: 'Laptop', linh_kien: 'Linh kiện', phu_kien: 'Phụ kiện',
  man_hinh: 'Màn hình', ram: 'RAM', ssd: 'SSD',
  cpu: 'CPU', gpu: 'GPU', mainboard: 'Mainboard', other: 'Khác'
}
const CAT_COLOR = {
  laptop:'bg-blue-500/15 text-blue-400', ram:'bg-green-500/15 text-green-400',
  ssd:'bg-orange-500/15 text-orange-400', cpu:'bg-purple-500/15 text-purple-400',
  gpu:'bg-red-500/15 text-red-400', linh_kien:'bg-cyan-500/15 text-cyan-400',
  phu_kien:'bg-pink-500/15 text-pink-400', man_hinh:'bg-indigo-500/15 text-indigo-400',
  mainboard:'bg-yellow-500/15 text-yellow-400', other:'bg-slate-500/15 text-slate-400',
}

function fmt(n) {
  return n ? new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(n) : '—'
}

function ProductModal({ product, onClose, onSave }) {
  const imgRef = useRef(null)
  const isEdit = !!product
  const [form, setForm] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    category: product?.category || 'laptop',
    brand: product?.brand || '',
    description: product?.description || '',
    price: product?.price || '',
    stock: product?.stock ?? 0,
  })
  const [imgFile, setImgFile] = useState(null)
  const BASE = BACKEND_URL
  const [imgPreview, setImgPreview] = useState(product?.images?.[0] ? (product.images[0].startsWith('http') ? product.images[0] : `${BASE}${product.images[0]}`) : null)
  const [loading, setLoading] = useState(false)

  const handleImg = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Ảnh tối đa 5MB'); return }
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    if (!form.name || !form.sku || !form.price || !form.brand) {
      toast.error('Vui lòng điền: tên, SKU, thương hiệu, giá'); return
    }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('sku', form.sku)
      fd.append('category', form.category)
      fd.append('brand', form.brand)
      fd.append('description', form.description)
      fd.append('price', form.price)
      fd.append('stock', form.stock)
      if (imgFile) fd.append('image', imgFile)

      let data
      if (isEdit) ({ data } = await api.put(`/products/${product._id}`, fd))
      else ({ data } = await api.post('/products', fd))

      onSave(data, isEdit)
      toast.success(isEdit ? 'Đã cập nhật sản phẩm' : 'Đã thêm sản phẩm')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Thao tác thất bại')
    } finally { setLoading(false) }
  }

  const f = (k) => ({ value: form[k], onChange: e => setForm({...form, [k]: e.target.value}) })

  return (
    <div className="modal-overlay animate-fade-in">
      <div className="modal-box w-full max-w-lg max-h-[90vh] flex flex-col animate-fade-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-bold text-white">{isEdit ? '✏️ Sửa sản phẩm' : '➕ Thêm sản phẩm'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-all"><X size={16}/></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Hình ảnh sản phẩm</label>
            <div className="flex items-start gap-4">
              <div onClick={() => imgRef.current?.click()}
                className={clsx('w-28 h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden flex-shrink-0',
                  imgPreview ? 'border-blue-500/50' : 'border-slate-700 hover:border-slate-500')}>
                {imgPreview
                  ? <img src={imgPreview} alt="" className="w-full h-full object-cover"/>
                  : <><ImageIcon size={22} className="text-slate-600 mb-1"/><span className="text-xs text-slate-600">Chọn ảnh</span></>
                }
              </div>
              <div className="text-xs text-slate-500 space-y-1 pt-2">
                <p>• JPG, PNG, WEBP</p><p>• Tối đa 5MB</p>
                {imgPreview && <button onClick={() => {setImgFile(null); setImgPreview(null)}}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1 mt-1"><X size={11}/> Xóa ảnh</button>}
              </div>
            </div>
            <input ref={imgRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImg}/>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Tên sản phẩm *</label>
              <input className="input" placeholder="VD: Dell XPS 15 9530" {...f('name')}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">SKU *</label>
              <input className="input" placeholder="DELL-XPS15-001" {...f('sku')}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Thương hiệu *</label>
              <input className="input" placeholder="Dell, ASUS, Apple..." {...f('brand')}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Danh mục *</label>
              <select className="input" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                {Object.entries(CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Giá (VNĐ) *</label>
              <input className="input" type="number" min="0" placeholder="25000000" {...f('price')}/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Tồn kho</label>
              <input className="input" type="number" min="0" placeholder="0" {...f('stock')}/>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Mô tả</label>
              <textarea className="input" rows={3} placeholder="Mô tả sản phẩm..." {...f('description')}/>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Hủy</button>
          <button onClick={handleSubmit} disabled={loading} className="btn-primary">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : (isEdit ? 'Cập nhật' : 'Thêm sản phẩm')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProductsPage() {
  const { isManager } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [modal, setModal] = useState(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const LIMIT = 12

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const params = { page, limit: LIMIT }
      if (search) params.search = search
      if (category) params.category = category
      const { data } = await api.get('/products', { params })
      setProducts(data.products || []); setTotal(data.total || 0)
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchProducts() }, [page, search, category])

  const handleSave = (saved, isEdit) => {
    if (isEdit) setProducts(prev => prev.map(p => p._id === saved._id ? saved : p))
    else { setProducts(prev => [saved, ...prev]); setTotal(t => t+1) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Xóa sản phẩm này?')) return
    try {
      await api.delete(`/products/${id}`)
      setProducts(prev => prev.filter(p => p._id !== id))
      setTotal(t => t-1)
      toast.success('Đã xóa')
    } catch (err) { toast.error(err.response?.data?.error || 'Xóa thất bại') }
  }

  // Image URL helper
  const BASE = BACKEND_URL
  const imgUrl = (p) => {
    if (!p.images?.[0]) return null
    const img = p.images[0]
    return img.startsWith('http') ? img : `${BASE}${img}`
  }

  return (
    <div className="p-6 space-y-5">
      {modal && <ProductModal product={modal==='create'?null:modal} onClose={()=>setModal(null)} onSave={handleSave}/>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Sản phẩm</h1>
          <p className="page-sub">Tổng: {total} sản phẩm</p>
        </div>
        {isManager && <button onClick={()=>setModal('create')} className="btn-primary"><Plus size={16}/> Thêm sản phẩm</button>}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
          <input className="input pl-9" placeholder="Tìm sản phẩm..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}/>
        </div>
        <select className="input w-40" value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}>
          <option value="">Tất cả danh mục</option>
          {Object.entries(CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_,i) => <div key={i} className="card space-y-3"><div className="skeleton h-40 w-full rounded-xl"/><div className="skeleton h-4 w-3/4"/><div className="skeleton h-3 w-1/2"/></div>)}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-600">
          <Package size={44} className="mb-3 opacity-30"/>
          <p className="font-medium">Không có sản phẩm nào</p>
          {isManager && <button onClick={()=>setModal('create')} className="btn-primary mt-4"><Plus size={15}/> Thêm đầu tiên</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {products.map(p => (
            <div key={p._id} className="card-hover group flex flex-col overflow-hidden p-0">
              <div className="h-44 bg-slate-800 flex items-center justify-center overflow-hidden rounded-t-2xl">
                {imgUrl(p)
                  ? <img src={imgUrl(p)} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}/>
                  : null
                }
                <div className={clsx('w-full h-full items-center justify-center', imgUrl(p) ? 'hidden' : 'flex')}>
                  <Package size={36} className="text-slate-600"/>
                </div>
              </div>
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{p.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{p.brand} · {p.sku}</p>
                  </div>
                  <span className={clsx('badge flex-shrink-0', CAT_COLOR[p.category]||CAT_COLOR.other)}>
                    {CATEGORIES[p.category]||'Khác'}
                  </span>
                </div>
                {p.description && <p className="text-xs text-slate-500 line-clamp-2 mb-3 flex-1">{p.description}</p>}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-800">
                  <div>
                    <p className="font-bold text-blue-400 text-sm">{fmt(p.price)}</p>
                    <p className="text-xs text-slate-600">Kho: {p.stock ?? 0}</p>
                  </div>
                  {isManager && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={()=>setModal(p)} className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"><Edit size={13}/></button>
                      <button onClick={()=>handleDelete(p._id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"><Trash2 size={13}/></button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {Math.ceil(total/LIMIT) > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="btn-secondary px-3 py-1.5 text-xs">← Trước</button>
          <span className="text-sm text-slate-400">{page} / {Math.ceil(total/LIMIT)}</span>
          <button onClick={()=>setPage(p=>p+1)} disabled={page>=Math.ceil(total/LIMIT)} className="btn-secondary px-3 py-1.5 text-xs">Tiếp →</button>
        </div>
      )}
    </div>
  )
}
