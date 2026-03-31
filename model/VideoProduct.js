import mongoose from 'mongoose';

const VideoProductSchema = new mongoose.Schema({
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Owner',
        required: true,
        index: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    videoUrl: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    },
    autoplay: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

export default mongoose.models.VideoProduct || mongoose.model('VideoProduct', VideoProductSchema);
