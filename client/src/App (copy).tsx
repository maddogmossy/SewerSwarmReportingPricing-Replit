import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import AppWrapper from "@/components/AppWrapper";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Upload from "@/pages/upload";
import Reports from "@/pages/reports";

import Pricing from "@/pages/pricing";
import SectorPricing from "@/pages/sector-pricing";

import SurveyPricing from "@/pages/survey-pricing";
import CleansingPricing from "@/pages/cleansing-pricing";
import JettingPricing from "@/pages/jetting-pricing";
import SimplePricing from "@/pages/simple-pricing";

import PR2Pricing from "@/pages/pr2-pricing";
import PR2PricingForm from "@/pages/pr2-pricing-form";
import PR2Category from "@/pages/pr2-category";
import PR2CCTV from "@/pages/pr2-cctv";
import PR2VanPack from "@/pages/pr2-van-pack";
import PR2JetVac from "@/pages/pr2-jet-vac";
import PR2PricingSimple from "@/pages/pr2-pricing-simple";
import TestPR2Routing from "@/pages/test-pr2-routing";
import PR2ConfigClean from "@/pages/pr2-config-clean";
import StandardsConfig from "@/pages/standards-config";
import DepotManagement from "@/pages/depot-management";

import Checkout from "@/pages/checkout";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    // Global error handler for unhandled rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      event.preventDefault(); // Prevent the default browser behavior
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        <p className="ml-4 text-gray-600">Loading authentication...</p>
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          <Route path="/" component={Home} />
          <Route path="/checkout" component={Checkout} />
        </>
      ) : (
        <>
          <Route path="/" component={Home} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/upload" component={Upload} />
          <Route path="/reports" component={Reports} />

          <Route path="/pricing/surveys" component={SurveyPricing} />
          <Route path="/pricing/cleansing" component={CleansingPricing} />
          <Route path="/pricing/jetting" component={JettingPricing} />
          <Route path="/simple-pricing" component={SimplePricing} />

          <Route path="/pr2-pricing" component={PR2Pricing} />
          <Route path="/pr2-pricing-form" component={PR2PricingForm} />
          <Route path="/pr2-config-clean" component={PR2ConfigClean} />
          <Route path="/pr2-category/:categoryId?" component={PR2Category} />
          <Route path="/pr2-cctv" component={PR2ConfigClean} />
          <Route path="/pr2-van-pack" component={PR2ConfigClean} />
          <Route path="/pr2-jet-vac" component={PR2ConfigClean} />
          <Route path="/pr2-cctv-jet-vac" component={PR2ConfigClean} />
          <Route path="/pr2-cctv-van-pack" component={PR2ConfigClean} />
          <Route
            path="/pr2-directional-water-cutter"
            component={PR2ConfigClean}
          />
          <Route path="/pr2-ambient-lining" component={PR2ConfigClean} />
          <Route path="/pr2-hot-cure-lining" component={PR2ConfigClean} />
          <Route path="/pr2-uv-lining" component={PR2ConfigClean} />
          <Route path="/pr2-ims-cutting" component={PR2ConfigClean} />
          <Route path="/pr2-excavation" component={PR2ConfigClean} />
          <Route path="/pr2-tankering" component={PR2ConfigClean} />
          <Route path="/sector-pricing" component={PR2Pricing} />
          <Route path="/sector-pricing/:sector" component={PR2Pricing} />
          <Route path="/standards-config" component={StandardsConfig} />
          <Route path="/depot-management" component={DepotManagement} />

          <Route path="/checkout" component={Checkout} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Add global promise rejection handler to prevent plug in errors
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      event.preventDefault(); // Prevent the default behavior
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppWrapper>
          <Toaster />
          <Router />
        </AppWrapper>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
