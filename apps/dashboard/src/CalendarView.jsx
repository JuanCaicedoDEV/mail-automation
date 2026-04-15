import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MoreHorizontal, Clock, Image as ImageIcon, ChevronLeftCircle, ChevronRightCircle } from 'lucide-react';
import { cn } from './lib/utils';
import { parseImageUrls, parseSqliteDate } from './postUtils';

const CalendarView = ({ posts, onPostClick }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const today = new Date();

    // Generate calendar grid
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const calendarDays = eachDayOfInterval({
        start: startDate,
        end: endDate,
    });

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Helper to get posts for a specific day
    const getPostsForDay = (day) => {
        return posts.filter(post => {
            if (!post.scheduled_at) return false;
            return isSameDay(parseSqliteDate(post.scheduled_at), day);
        });
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-indigo-600" />
                    {format(currentDate, 'MMMM yyyy')}
                </h2>
                <div className="flex items-center gap-2">
                    <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <button onClick={() => setCurrentDate(today)} className="text-xs font-medium px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700 transition-colors">
                        Today
                    </button>
                    <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                </div>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                {weekDays.map(day => (
                    <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {day}
                    </div>
                ))}
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto">
                {calendarDays.map((day, idx) => {
                    const dayPosts = getPostsForDay(day);
                    const isCurrentMonth = isSameMonth(day, monthStart);
                    const isToday = isSameDay(day, today);

                    return (
                        <div
                            key={day.toString()}
                            className={cn(
                                "min-h-[120px] border-b border-r border-gray-100 p-2 flex flex-col gap-1 transition-colors hover:bg-gray-50/50",
                                !isCurrentMonth && "bg-gray-50/30 text-gray-400",
                                isToday && "bg-indigo-50/30"
                            )}
                        >
                            <div className="flex justify-between items-start">
                                <span className={cn(
                                    "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                                    isToday ? "bg-indigo-600 text-white" : "text-gray-700"
                                )}>
                                    {format(day, 'd')}
                                </span>
                                {dayPosts.length > 0 && (
                                    <span className="text-[10px] font-medium text-gray-400">
                                        {dayPosts.length} email{dayPosts.length !== 1 && 's'}
                                    </span>
                                )}
                            </div>

                            {/* Posts List */}
                            <div className="flex-1 flex flex-col gap-1 mt-1 overflow-y-auto max-h-[150px] custom-scrollbar">
                                {dayPosts.map(post => (
                                    <CalendarPostItem key={post.id} post={post} onClick={() => onPostClick(post)} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// Component for individual post in calendar cell
const CalendarPostItem = ({ post, onClick }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    let images = [];
    try {
        images = parseImageUrls(post.image_urls);
    } catch (e) {
        images = [];
    }

    const hasMultipleImages = images && images.length > 1;

    const nextImage = (e) => {
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev + 1) % images.length);
    };

    const prevImage = (e) => {
        e.stopPropagation();
        setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    return (
        <div
            onClick={onClick}
            className="group relative bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer"
        >
            {/* Image Thumbnail / Carousel */}
            <div className="aspect-video relative bg-gray-100">
                {images.length > 0 ? (
                    <img
                        src={images[currentImageIndex]}
                        alt="Email thumbnail"
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <ImageIcon className="w-4 h-4" />
                    </div>
                )}

                {/* Status Badge Overlay */}
                <div className="absolute top-1 right-1">
                    <div className={cn(
                        "w-2 h-2 rounded-full",
                        post.status === 'APPROVED' ? "bg-green-500" :
                            post.status === 'PENDING' ? "bg-yellow-500" : "bg-red-500"
                    )} />
                </div>

                {/* Carousel Controls (Mini) */}
                {hasMultipleImages && (
                    <>
                        <button
                            onClick={prevImage}
                            className="absolute left-0.5 top-1/2 -translate-y-1/2 p-0.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <ChevronLeftCircle className="w-3 h-3" />
                        </button>
                        <button
                            onClick={nextImage}
                            className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <ChevronRightCircle className="w-3 h-3" />
                        </button>
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                            {images.map((_, idx) => (
                                <div key={idx} className={cn("w-1 h-1 rounded-full", idx === currentImageIndex ? "bg-white" : "bg-white/50")} />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Caption Snippet */}
            <div className="p-1.5">
                <p className="text-[10px] text-gray-600 line-clamp-1 leading-tight">
                    {post.caption || post.specific_prompt || "No content"}
                </p>
                <div className="flex items-center gap-1 mt-1 text-[9px] text-gray-400">
                    <Clock className="w-2.5 h-2.5" />
                    {format(parseSqliteDate(post.scheduled_at), 'h:mm a')}
                </div>
            </div>
        </div>
    );
};

export default CalendarView;
